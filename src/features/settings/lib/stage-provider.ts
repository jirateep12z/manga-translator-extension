import type {
  PipelineStage,
  ProviderConnection,
  ReasoningEffortLevel
} from '@/services/ai-provider';
import type {
  ReasoningEffort,
  Settings,
  StageProvider
} from '../types/settings';

// "Same as image reading" applies only to the AI reader (spec 0002 §9.2).
export function IsTranslationSameAsImageReading(settings: Settings): boolean {
  return (
    settings.image_reading.reader === 'ai' &&
    settings.translation.is_same_as_image_reading
  );
}

export function ResolveStageProvider(
  settings: Settings,
  stage: PipelineStage
): StageProvider {
  const is_image_reading_stage =
    stage === 'image_reading' || IsTranslationSameAsImageReading(settings);
  const source = is_image_reading_stage
    ? settings.image_reading
    : settings.translation;

  return {
    provider: source.provider,
    model: source.model,
    reasoning_effort: source.reasoning_effort
  };
}

// The model default sends no reasoning field, so the model decides.
export function ToCompletionReasoningEffort(
  reasoning_effort: ReasoningEffort
): ReasoningEffortLevel | null {
  return reasoning_effort === 'model_default' ? null : reasoning_effort;
}

// The stages that call a provider: translation, plus image reading when an AI
// model reads the pages (spec 0002 §9.2).
export function ResolveProviderStages(settings: Settings): StageProvider[] {
  const translation_stage = ResolveStageProvider(settings, 'translation');

  return settings.image_reading.reader === 'ai'
    ? [ResolveStageProvider(settings, 'image_reading'), translation_stage]
    : [translation_stage];
}

export function IsProviderConfigured(settings: Settings): boolean {
  const stages = ResolveProviderStages(settings);
  const has_models = stages.every(stage => stage.model !== '');
  const needs_api_key = stages.some(stage => stage.provider === 'openrouter');

  return has_models && (!needs_api_key || settings.openrouter_api_key !== '');
}

export function CreateProviderConnection(
  settings: Settings
): ProviderConnection {
  return {
    openrouter_api_key: settings.openrouter_api_key,
    ollama_base_url: settings.ollama_base_url
  };
}
