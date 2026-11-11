import {
  ReadChapter,
  ReadPreviousChapterSummaries,
  ReadSeries,
  SaveChapterSummary
} from '@/features/memory';
import {
  CreateProviderConnection,
  IsProviderConfigured,
  ReadSettings,
  ResolveStageProvider,
  ToCompletionReasoningEffort
} from '@/features/settings';
import { AppError } from '@/lib/app-error';
import { CreateProvider } from '@/services/ai-provider';
import { FINALIZATION_TEMPERATURE } from '../constants/pipeline';
import { FINALIZATION_SYSTEM_PROMPT } from '../constants/prompts';
import { FINALIZATION_JSON_SCHEMA } from '../constants/response-schemas';
import { BuildFinalizationUserText } from '../lib/build-user-text';
import { ShouldFinalizeChapter } from '../lib/should-finalize-chapter';
import { ValidateFinalizationResponse } from '../lib/validate-translation';
import { RunJsonStage } from './run-json-stage.service';

const PREVIOUS_CHAPTER_LIMIT = 1;

export async function FinalizeChapter(input: {
  series_id: string;
  chapter_number: string;
  is_forced: boolean;
  signal: AbortSignal;
}): Promise<boolean> {
  const chapter = await ReadChapter(input.series_id, input.chapter_number);

  if (!chapter || !ShouldFinalizeChapter(chapter, input.is_forced)) {
    return false;
  }

  const settings = await ReadSettings();

  if (!IsProviderConfigured(settings)) {
    throw new AppError('NOT_CONFIGURED', 'Set up a provider in Settings.');
  }

  const series = await ReadSeries(input.series_id);

  if (!series) throw new AppError('CANCELED', 'The series no longer exists.');

  const [previous_chapter] = await ReadPreviousChapterSummaries(
    input.series_id,
    input.chapter_number,
    PREVIOUS_CHAPTER_LIMIT
  );
  const translation = ResolveStageProvider(settings, 'translation');
  const { value } = await RunJsonStage({
    provider: CreateProvider(
      translation.provider,
      CreateProviderConnection(settings)
    ),
    request: {
      model: translation.model,
      system_prompt: FINALIZATION_SYSTEM_PROMPT,
      user_text: BuildFinalizationUserText({
        series_title: series.canonical_title,
        synopsis_en: series.synopsis_en,
        previous_chapter: previous_chapter ?? null,
        chapter
      }),
      images_base64_jpeg: [],
      json_schema: FINALIZATION_JSON_SCHEMA,
      temperature: FINALIZATION_TEMPERATURE,
      reasoning_effort: ToCompletionReasoningEffort(
        translation.reasoning_effort
      )
    },
    Validate: ValidateFinalizationResponse,
    signal: input.signal
  });

  await SaveChapterSummary({
    series_id: input.series_id,
    chapter_number: input.chapter_number,
    summary_en: value.chapter_summary_en,
    synopsis_en: value.synopsis_en
  });

  return true;
}
