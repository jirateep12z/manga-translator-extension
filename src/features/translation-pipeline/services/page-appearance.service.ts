import {
  AnalyzePageAppearance,
  REGION_APPEARANCE_VERSION,
  type GlyphHint,
  type PageAppearanceResult
} from '@/features/region-appearance';
import { SavePageReadingAppearance } from '@/features/translation-cache';
import { ToErrorCode } from '@/lib/app-error';
import type { PageReadingRecord } from '@/services/database';
import type { ErrorCode } from '@/types/error-code';
import type { PageJob } from '../types/pipeline';
import { ReadRgbaImage } from './image-codec.service';
import { FetchImageBytes } from './image-fetch.service';

const REGION_APPEARANCE_LOG_EVENT = '[background] region-appearance';

type AppearanceTrigger = 'new_reading' | 'cache_upgrade';
type AppearanceSkipReason = 'size_mismatch' | 'capture_source';

// What the analysis step measured. A step that did not complete is null.
type AnalysisMeasures = {
  scale: number | null;
  decode_ms: number | null;
  analysis_ms: number | null;
};

type AnalysisReport =
  | {
      outcome: 'succeeded';
      result: PageAppearanceResult;
      measures: AnalysisMeasures;
    }
  | {
      outcome: 'skipped';
      skip_reason: AppearanceSkipReason;
      measures: AnalysisMeasures;
    }
  | { outcome: 'failed'; error_code: ErrorCode; measures: AnalysisMeasures };

const NO_MEASURES: AnalysisMeasures = {
  scale: null,
  decode_ms: null,
  analysis_ms: null
};

type AppearanceCounts = {
  closed_count: number;
  textured_count: number;
  display_count: number;
  display_large_count: number;
};

// Counts the analyzed regions by frame, backdrop, and lettering.
function CountAppearances(result: PageAppearanceResult): AppearanceCounts {
  const appearances = result.regions.flatMap(region =>
    region.appearance ? [region.appearance] : []
  );

  return {
    closed_count: appearances.filter(
      appearance => appearance.frame === 'closed'
    ).length,
    textured_count: appearances.filter(
      appearance => appearance.backdrop === 'textured'
    ).length,
    display_count: appearances.filter(
      appearance => appearance.lettering === 'display'
    ).length,
    display_large_count: appearances.filter(
      appearance => appearance.lettering === 'display_large'
    ).length
  };
}

// One entry for each analysis attempt (spec 0003 §12). It holds counts,
// timings, and codes only, never text, colors, or image data.
function LogRegionAppearance(fields: {
  job: PageJob;
  reading: PageReadingRecord;
  trigger: AppearanceTrigger;
  glyph_hints: readonly GlyphHint[];
  report: AnalysisReport;
  fetch_ms: number | null;
  duration_ms: number;
  is_saved: boolean | null;
}): void {
  const { job, reading, report } = fields;
  const result = report.outcome === 'succeeded' ? report.result : null;
  const counts = result ? CountAppearances(result) : null;

  console.info(REGION_APPEARANCE_LOG_EVENT, {
    series_id: job.series_id,
    chapter_number: job.chapter_number,
    page_index: job.page_index,
    trigger: fields.trigger,
    image_source: job.image_source.type,
    reader: reading.reader ?? 'ai',
    region_count: reading.regions.length,
    analyzed_region_count: result?.analyzed_region_count ?? null,
    timed_out_region_count: result?.timed_out_region_count ?? null,
    closed_count: counts?.closed_count ?? null,
    textured_count: counts?.textured_count ?? null,
    display_count: counts?.display_count ?? null,
    display_large_count: counts?.display_large_count ?? null,
    glyph_source: fields.glyph_hints.length > 0 ? 'ocr_lines' : 'ink',
    scale: report.measures.scale,
    fetch_ms: fields.fetch_ms,
    decode_ms: report.measures.decode_ms,
    analysis_ms: report.measures.analysis_ms,
    duration_ms: fields.duration_ms,
    is_saved: fields.is_saved,
    outcome: report.outcome,
    skip_reason: report.outcome === 'skipped' ? report.skip_reason : null,
    error_code: report.outcome === 'failed' ? report.error_code : null
  });
}

// Decodes the page and analyzes its regions. A failed decode or analysis is
// reported, not thrown, except CANCELED, which passes on.
async function ReadAndAnalyze(input: {
  reading: PageReadingRecord;
  image_blob: Blob;
  glyph_hints: GlyphHint[];
  signal: AbortSignal;
}): Promise<AnalysisReport> {
  const { reading } = input;
  let measures = NO_MEASURES;

  try {
    const decode_started_at_ms = performance.now();
    const decoded = await ReadRgbaImage(input.image_blob);

    measures = {
      ...measures,
      scale: decoded.scale,
      decode_ms: Math.round(performance.now() - decode_started_at_ms)
    };

    if (
      decoded.natural_width_px !== reading.width_px ||
      decoded.natural_height_px !== reading.height_px
    ) {
      return { outcome: 'skipped', skip_reason: 'size_mismatch', measures };
    }

    const result = await AnalyzePageAppearance({
      image: decoded.image,
      scale: decoded.scale,
      page_width_px: reading.width_px,
      page_height_px: reading.height_px,
      regions: reading.regions,
      glyph_hints: input.glyph_hints,
      signal: input.signal
    });

    measures = { ...measures, analysis_ms: Math.round(result.analysis_ms) };

    return { outcome: 'succeeded', result, measures };
  } catch (error) {
    const error_code = ToErrorCode(error);

    if (error_code === 'CANCELED') throw error;

    return { outcome: 'failed', error_code, measures };
  }
}

// Adds appearance to a reading that was just read, before it is saved
// (spec 0003 §7.2). The reading is processed for this analysis version even
// when the analysis fails. Rejects only with CANCELED.
export async function AddAppearanceToNewReading(input: {
  job: PageJob;
  reading: PageReadingRecord;
  image_blob: Blob;
  glyph_hints: GlyphHint[];
  signal: AbortSignal;
}): Promise<PageReadingRecord> {
  const { reading } = input;

  if (reading.regions.length === 0) {
    return { ...reading, appearance_version: REGION_APPEARANCE_VERSION };
  }

  const started_at_ms = performance.now();
  const report = await ReadAndAnalyze(input);

  LogRegionAppearance({
    job: input.job,
    reading,
    trigger: 'new_reading',
    glyph_hints: input.glyph_hints,
    report,
    fetch_ms: null,
    duration_ms: Math.round(performance.now() - started_at_ms),
    is_saved: null
  });

  if (report.outcome === 'succeeded') {
    return {
      ...reading,
      regions: report.result.regions,
      appearance_version: REGION_APPEARANCE_VERSION
    };
  }

  return { ...reading, appearance_version: REGION_APPEARANCE_VERSION };
}

// The bytes for an upgrade: the bytes already in hand, or the page's own
// image fetched by URL. A capture source has neither (spec 0003 §7.3).
type UpgradeBytes =
  | { status: 'obtained'; image_blob: Blob; fetch_ms: number | null }
  | { status: 'failed'; error_code: ErrorCode }
  | { status: 'capture_source' };

async function ObtainUpgradeBytes(input: {
  job: PageJob;
  image_blob: Blob | null;
  signal: AbortSignal;
}): Promise<UpgradeBytes> {
  if (input.image_blob) {
    return { status: 'obtained', image_blob: input.image_blob, fetch_ms: null };
  }

  const image_source = input.job.image_source;

  if (image_source.type !== 'url') return { status: 'capture_source' };

  const fetch_started_at_ms = performance.now();

  try {
    const image_blob = await FetchImageBytes({
      image_url: image_source.image_url,
      page_url: input.job.page_url,
      is_referrer_hidden: image_source.is_referrer_hidden,
      signal: input.signal
    });

    return {
      status: 'obtained',
      image_blob,
      fetch_ms: Math.round(performance.now() - fetch_started_at_ms)
    };
  } catch (error) {
    const error_code = ToErrorCode(error);

    if (error_code === 'CANCELED') throw error;

    return { status: 'failed', error_code };
  }
}

// The reading, processed for this analysis version without appearance, so
// that the page is not fetched again for it.
function CreateAppearanceMarker(reading: PageReadingRecord): PageReadingRecord {
  return {
    ...reading,
    regions: reading.regions.map(
      ({ appearance: _previous_appearance, ...region }) => region
    ),
    appearance_version: REGION_APPEARANCE_VERSION
  };
}

// A failed save keeps the page in view; the log reports it.
async function TrySaveReadingAppearance(
  reading: PageReadingRecord
): Promise<boolean> {
  try {
    return await SavePageReadingAppearance(reading);
  } catch {
    return false;
  }
}

// Upgrades a cached reading without current appearance. It reads the page
// image once more and analyzes it on the device, with no AI call and no OCR
// request, then saves the appearance, or a marker when the upgrade fails
// (spec 0003 §7.3). Rejects only with CANCELED, and then saves nothing.
export async function UpgradeCachedReadingAppearance(input: {
  job: PageJob;
  reading: PageReadingRecord;
  image_blob: Blob | null;
  signal: AbortSignal;
}): Promise<PageReadingRecord> {
  const { job, reading } = input;

  if (
    reading.regions.length === 0 ||
    reading.appearance_version === REGION_APPEARANCE_VERSION ||
    reading.source_language === job.target_language
  ) {
    return reading;
  }

  const started_at_ms = performance.now();
  const bytes = await ObtainUpgradeBytes(input);

  if (bytes.status === 'capture_source') {
    LogRegionAppearance({
      job,
      reading,
      trigger: 'cache_upgrade',
      glyph_hints: [],
      report: {
        outcome: 'skipped',
        skip_reason: 'capture_source',
        measures: NO_MEASURES
      },
      fetch_ms: null,
      duration_ms: Math.round(performance.now() - started_at_ms),
      is_saved: null
    });

    return reading;
  }

  const report: AnalysisReport =
    bytes.status === 'obtained'
      ? await ReadAndAnalyze({
          reading,
          image_blob: bytes.image_blob,
          glyph_hints: [],
          signal: input.signal
        })
      : {
          outcome: 'failed',
          error_code: bytes.error_code,
          measures: NO_MEASURES
        };
  const upgraded_reading =
    report.outcome === 'succeeded'
      ? {
          ...reading,
          regions: report.result.regions,
          appearance_version: REGION_APPEARANCE_VERSION
        }
      : CreateAppearanceMarker(reading);
  const is_saved = await TrySaveReadingAppearance(upgraded_reading);

  LogRegionAppearance({
    job,
    reading,
    trigger: 'cache_upgrade',
    glyph_hints: [],
    report,
    fetch_ms: bytes.status === 'obtained' ? bytes.fetch_ms : null,
    duration_ms: Math.round(performance.now() - started_at_ms),
    is_saved
  });

  return upgraded_reading;
}
