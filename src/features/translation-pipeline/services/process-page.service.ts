import {
  BuildMemoryContext,
  ListEntities,
  MAX_CONTEXT_CHAPTER_SUMMARIES,
  MAX_DIALOGUE_PAGES_SCANNED,
  ReadChapter,
  ReadPreviousChapterSummaries,
  ReadSeries,
  type DialoguePage
} from '@/features/memory';
import { ReadPageWithOcr } from '@/features/ocr-reader';
import type { GlyphHint } from '@/features/region-appearance';
import {
  CreateProviderConnection,
  IsProviderConfigured,
  ReadSettings,
  ResolveStageProvider,
  ToCompletionReasoningEffort,
  type ImageReader,
  type Settings
} from '@/features/settings';
import {
  FindPageReadingByImageUrl,
  ListChapterPageTranslations,
  ReadPageReading,
  ReadPageTranslation,
  SavePageReading,
  TouchPageReading
} from '@/features/translation-cache';
import { AppError } from '@/lib/app-error';
import { CreateSha256Hex } from '@/lib/hash';
import { CreateProvider } from '@/services/ai-provider';
import type { PageReadingRecord, SeriesRecord } from '@/services/database';
import { DecodeBase64ToBlob } from '../lib/image-bytes';
import { BuildPageResult, DeriveCachedOutcome } from '../lib/page-result';
import { ToStoredTranslations } from '../lib/to-stored-translations';
import type {
  PageEnvironment,
  PageJob,
  PageTranslationResult
} from '../types/pipeline';
import { CaptureVisibleImage } from './capture.service';
import { CommitPageResult } from './commit-page-result.service';
import { ReadImageSize } from './image-codec.service';
import { FetchImageBytes } from './image-fetch.service';
import {
  AddAppearanceToNewReading,
  UpgradeCachedReadingAppearance
} from './page-appearance.service';
import { ReadPageImage } from './read-page-image.service';
import { TranslatePageText } from './translate-page-text.service';

const CAPTURE_KEY_PREFIX = 'capture:';
const INLINE_IMAGE_URL_PREFIX = 'inline:';
// Readings saved before spec 0002 have no reader; the AI reader made them.
const LEGACY_READING_READER: ImageReader = 'ai';

type PageJobContext = {
  job: PageJob;
  environment: PageEnvironment;
  settings: Settings;
  series: SeriesRecord;
  now_iso: string;
  NotifyCaptureDone: () => void;
  TouchReadingOnce: (reading: PageReadingRecord) => Promise<void>;
};

type ReadingLookup = {
  reading: PageReadingRecord | undefined;
  reading_key: string | null;
  inline_blob: Blob | null;
};

type PageBytes = { image_blob: Blob; reading_key: string };

type PageImageReading = Pick<
  PageReadingRecord,
  'width_px' | 'height_px' | 'source_language' | 'regions' | 'model'
> & { glyph_hints: GlyphHint[] };

async function AssertPreconditions(job: PageJob): Promise<{
  settings: Settings;
  series: SeriesRecord;
}> {
  const settings = await ReadSettings();

  if (!settings.is_enabled) {
    throw new AppError('CANCELED', 'Translation is turned off.');
  }

  // A cache-only page never calls a provider (spec 0005 §5).
  if (!job.is_cache_only && !IsProviderConfigured(settings)) {
    throw new AppError('NOT_CONFIGURED', 'Set up a provider in Settings.');
  }

  const series = await ReadSeries(job.series_id);

  if (!series) throw new AppError('CANCELED', 'The series no longer exists.');

  return { settings, series };
}

async function LookUpReading(job: PageJob): Promise<ReadingLookup> {
  const { image_source } = job;

  if (image_source.type === 'url') {
    return {
      reading: await FindPageReadingByImageUrl(image_source.image_url),
      reading_key: null,
      inline_blob: null
    };
  }

  if (image_source.type === 'capture') {
    const reading_key = await CreateSha256Hex(
      `${CAPTURE_KEY_PREFIX}${image_source.image_url}`
    );

    return {
      reading: await ReadPageReading(reading_key),
      reading_key,
      inline_blob: null
    };
  }

  const inline_blob = DecodeBase64ToBlob(
    image_source.image_base64,
    image_source.mime_type
  );
  const reading_key = await CreateSha256Hex(await inline_blob.arrayBuffer());

  return {
    reading: await ReadPageReading(reading_key),
    reading_key,
    inline_blob
  };
}

// A reading made by the other reader counts as a cache miss (spec 0002 §5.5).
function KeepReadingFromReader(
  reading: PageReadingRecord | undefined,
  reader: ImageReader
): PageReadingRecord | undefined {
  return (reading?.reader ?? LEGACY_READING_READER) === reader
    ? reading
    : undefined;
}

async function ReadCachedResult(
  context: PageJobContext,
  reading: PageReadingRecord
): Promise<PageTranslationResult | null> {
  const { job } = context;

  // A cached reading means no capture is needed, so the page can show again
  // now instead of after stage 2.
  context.NotifyCaptureDone();
  await context.TouchReadingOnce(reading);

  if (job.is_retranslation) return null;

  const translation = await ReadPageTranslation(
    reading.reading_key,
    job.target_language
  );

  if (!translation) return null;

  return BuildPageResult({
    page_index: job.page_index,
    reading,
    target_language: job.target_language,
    translations: translation.translations,
    outcome: DeriveCachedOutcome(reading, job.target_language)
  });
}

async function ObtainPageBytes(
  context: PageJobContext,
  lookup: ReadingLookup
): Promise<PageBytes> {
  const { job, environment } = context;
  const { image_source } = job;

  if (image_source.type === 'url') {
    const image_blob = await FetchImageBytes({
      image_url: image_source.image_url,
      page_url: job.page_url,
      is_referrer_hidden: image_source.is_referrer_hidden,
      signal: environment.signal
    });

    return {
      image_blob,
      reading_key: await CreateSha256Hex(await image_blob.arrayBuffer())
    };
  }

  if (image_source.type === 'capture') {
    const image_blob = await CaptureVisibleImage({
      tab_id: environment.tab_id,
      window_id: environment.window_id,
      rect_css_px: image_source.rect_css_px,
      device_pixel_ratio: image_source.device_pixel_ratio,
      signal: environment.signal
    });

    context.NotifyCaptureDone();

    return { image_blob, reading_key: lookup.reading_key ?? '' };
  }

  return {
    image_blob: lookup.inline_blob ?? new Blob([]),
    reading_key: lookup.reading_key ?? ''
  };
}

function ReadStoredImageUrl(job: PageJob, reading_key: string): string {
  return job.image_source.type === 'inline'
    ? `${INLINE_IMAGE_URL_PREFIX}${reading_key}`
    : job.image_source.image_url;
}

async function ReadPageWithSelectedReader(
  context: PageJobContext,
  image_blob: Blob
): Promise<PageImageReading> {
  const { settings, environment } = context;

  if (settings.image_reading.reader === 'ocr') {
    // The OCR document reports an image it cannot decode as OCR_FAILED, and a
    // retry by URL fails the same way. Decoding it here first fails the page
    // with IMAGE_FETCH_FAILED, as the AI reader does, so Retry can capture it.
    await ReadImageSize(image_blob);

    return ReadPageWithOcr({
      image_blob,
      reading_direction: settings.reading_direction,
      signal: environment.signal
    });
  }

  const image_reading = ResolveStageProvider(settings, 'image_reading');

  // The AI reader has no OCR lines, so the analysis measures glyphs from ink.
  return {
    ...(await ReadPageImage({
      image_blob,
      provider: CreateProvider(
        image_reading.provider,
        CreateProviderConnection(settings)
      ),
      model: image_reading.model,
      reasoning_effort: ToCompletionReasoningEffort(
        image_reading.reasoning_effort
      ),
      reading_direction: settings.reading_direction,
      signal: environment.signal
    })),
    glyph_hints: []
  };
}

async function ReadNewPage(
  context: PageJobContext,
  page_bytes: PageBytes
): Promise<PageReadingRecord> {
  const { job, settings, environment, now_iso } = context;
  const page_image = await ReadPageWithSelectedReader(
    context,
    page_bytes.image_blob
  );
  const reading: PageReadingRecord = {
    reading_key: page_bytes.reading_key,
    image_url: ReadStoredImageUrl(job, page_bytes.reading_key),
    width_px: page_image.width_px,
    height_px: page_image.height_px,
    source_language: page_image.source_language,
    regions: page_image.regions,
    model: page_image.model,
    reader: settings.image_reading.reader,
    created_at: now_iso,
    last_used_at: now_iso
  };
  // The reading and its appearance are saved together (spec 0003 §7.2).
  const analyzed_reading = await AddAppearanceToNewReading({
    job,
    reading,
    image_blob: page_bytes.image_blob,
    glyph_hints: page_image.glyph_hints,
    signal: environment.signal
  });

  await SavePageReading(analyzed_reading);

  return analyzed_reading;
}

// The chapter's lower pages nearest to this one, for the dialogue window
// (spec 0004 §5.2). Readings that were evicted are skipped.
async function ReadDialoguePages(job: PageJob): Promise<DialoguePage[]> {
  const page_translations = await ListChapterPageTranslations({
    series_id: job.series_id,
    chapter_number: job.chapter_number,
    target_language: job.target_language,
    page_hostname: job.page_hostname
  });
  const nearest_translations = page_translations
    .filter(translation => translation.page_index < job.page_index)
    .sort((left, right) => right.page_index - left.page_index)
    .slice(0, MAX_DIALOGUE_PAGES_SCANNED);
  const dialogue_pages: DialoguePage[] = [];

  for (const translation of nearest_translations) {
    const reading = await ReadPageReading(translation.reading_key);

    if (!reading) continue;

    const translation_by_region = new Map(
      translation.translations.map(line => [line.region_id, line])
    );

    dialogue_pages.push({
      page_index: translation.page_index,
      lines: reading.regions.flatMap(region => {
        const line = translation_by_region.get(region.region_id);

        return line === undefined
          ? []
          : [
              {
                speaker: line.speaker_source_name ?? '',
                source_text: region.source_text,
                translated_text: line.text
              }
            ];
      })
    });
  }

  return dialogue_pages;
}

async function TranslateReading(
  context: PageJobContext,
  reading: PageReadingRecord
): Promise<PageTranslationResult> {
  const { job, settings, series, environment, now_iso } = context;
  const page_source_text = reading.regions
    .map(region => region.source_text)
    .join('\n');
  const [
    entities,
    current_chapter,
    previous_chapter_summaries,
    dialogue_pages
  ] = await Promise.all([
    ListEntities(job.series_id),
    ReadChapter(job.series_id, job.chapter_number),
    ReadPreviousChapterSummaries(
      job.series_id,
      job.chapter_number,
      MAX_CONTEXT_CHAPTER_SUMMARIES
    ),
    ReadDialoguePages(job)
  ]);
  const memory_context = BuildMemoryContext({
    series,
    entities,
    target_language: job.target_language,
    page_source_text,
    previous_chapter_summaries,
    current_chapter,
    dialogue_pages
  });
  const translation = ResolveStageProvider(settings, 'translation');
  const translated_page = await TranslatePageText({
    provider: CreateProvider(
      translation.provider,
      CreateProviderConnection(settings)
    ),
    model: translation.model,
    reasoning_effort: ToCompletionReasoningEffort(translation.reasoning_effort),
    regions: reading.regions,
    context: memory_context,
    target_language: job.target_language,
    signal: environment.signal
  });

  await CommitPageResult({
    ...CreateCommitBase(job, reading, now_iso, page_source_text),
    translations: ToStoredTranslations(translated_page.response.translations),
    model: translated_page.model,
    reported_entities: translated_page.response.new_entities,
    page_note_en: translated_page.response.page_note_en || null,
    alias_candidates: translated_page.alias_candidates,
    speech_observations: translated_page.response.speech_observations,
    learned_name_variants: translated_page.learned_name_variants
  });

  return BuildPageResult({
    page_index: job.page_index,
    reading,
    target_language: job.target_language,
    translations: translated_page.response.translations,
    outcome:
      translated_page.has_name_warnings ||
      translated_page.has_script_warnings ||
      translated_page.has_speech_warnings
        ? 'translated_with_warnings'
        : 'translated'
  });
}

function CreateCommitBase(
  job: PageJob,
  reading: PageReadingRecord,
  now_iso: string,
  page_source_text: string
) {
  return {
    series_id: job.series_id,
    chapter_number: job.chapter_number,
    page_index: job.page_index,
    page_url: job.page_url,
    page_hostname: job.page_hostname,
    target_language: job.target_language,
    reading_key: reading.reading_key,
    page_source_text,
    now_iso
  };
}

async function CommitWithoutTranslation(
  context: PageJobContext,
  reading: PageReadingRecord
): Promise<PageTranslationResult> {
  const { job, now_iso } = context;

  await CommitPageResult({
    ...CreateCommitBase(job, reading, now_iso, ''),
    translations: [],
    model: reading.model,
    reported_entities: [],
    page_note_en: null,
    alias_candidates: [],
    speech_observations: [],
    learned_name_variants: []
  });

  return BuildPageResult({
    page_index: job.page_index,
    reading,
    target_language: job.target_language,
    translations: [],
    outcome: DeriveCachedOutcome(reading, job.target_language)
  });
}

async function RunPageJob(
  context: PageJobContext
): Promise<PageTranslationResult> {
  const { job, environment } = context;
  const reader = context.settings.image_reading.reader;
  const lookup = await LookUpReading(job);
  let reading = KeepReadingFromReader(lookup.reading, reader);

  // A reused reading passes through the upgrade before it is served
  // (spec 0003 §5.4), with the bytes already in hand, if any. It is touched
  // first, so that eviction by another tab does not drop it while the upgrade
  // fetches and analyzes the page.
  if (reading) {
    await context.TouchReadingOnce(reading);
    reading = await UpgradeCachedReadingAppearance({
      job,
      reading,
      image_blob: lookup.inline_blob,
      signal: environment.signal
    });

    const cached_result = await ReadCachedResult(context, reading);

    if (cached_result) return cached_result;
  } else {
    const page_bytes = await ObtainPageBytes(context, lookup);

    reading = KeepReadingFromReader(
      await ReadPageReading(page_bytes.reading_key),
      reader
    );

    if (reading) {
      await context.TouchReadingOnce(reading);
      reading = await UpgradeCachedReadingAppearance({
        job,
        reading,
        image_blob: page_bytes.image_blob,
        signal: environment.signal
      });

      const cached_result = await ReadCachedResult(context, reading);

      if (cached_result) return cached_result;
    } else {
      if (job.is_cache_only) throw CreateNotCachedError();

      reading = await ReadNewPage(context, page_bytes);
    }
  }

  const has_nothing_to_translate =
    reading.regions.length === 0 ||
    reading.source_language === job.target_language;

  if (has_nothing_to_translate) {
    return CommitWithoutTranslation(context, reading);
  }

  if (job.is_cache_only) throw CreateNotCachedError();

  return TranslateReading(context, reading);
}

function CreateNotCachedError(): AppError {
  return new AppError('NOT_CACHED', 'This page has no saved translation.');
}

export async function ProcessTranslatePage(
  job: PageJob,
  environment: PageEnvironment
): Promise<PageTranslationResult> {
  const { settings, series } = await AssertPreconditions(job);
  let is_capture_notified = false;
  let is_reading_touched = false;
  const now_iso = new Date().toISOString();
  const NotifyCaptureDone = () => {
    if (job.image_source.type !== 'capture' || is_capture_notified) return;

    is_capture_notified = true;
    environment.OnCaptureDone();
  };
  const TouchReadingOnce = async (reading: PageReadingRecord) => {
    if (is_reading_touched) return;

    is_reading_touched = true;
    await TouchPageReading(reading.reading_key, now_iso);
  };

  try {
    return await RunPageJob({
      job,
      environment,
      settings,
      series,
      now_iso,
      NotifyCaptureDone,
      TouchReadingOnce
    });
  } finally {
    NotifyCaptureDone();
  }
}
