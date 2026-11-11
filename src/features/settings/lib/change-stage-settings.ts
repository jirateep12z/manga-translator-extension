import type {
  ModelInfo,
  PipelineStage,
  ProviderName
} from '@/services/ai-provider';
import type {
  ImageReader,
  ReasoningEffort,
  Settings,
  StageProvider
} from '../types/settings';
import { IsTranslationSameAsImageReading } from './stage-provider';
import { SuggestReasoningEffort } from './suggest-reasoning-effort';

function UpdateStage(
  settings: Settings,
  stage: PipelineStage,
  changes: Partial<StageProvider>
): Settings {
  return stage === 'image_reading'
    ? { ...settings, image_reading: { ...settings.image_reading, ...changes } }
    : { ...settings, translation: { ...settings.translation, ...changes } };
}

// A model ID and its reasoning levels belong to one provider, so switching
// providers clears the model and resets the reasoning effort.
export function ChangeStageProvider(
  settings: Settings,
  stage: PipelineStage,
  provider: ProviderName
): Settings {
  if (settings[stage].provider === provider) return settings;

  return UpdateStage(settings, stage, {
    provider,
    model: '',
    reasoning_effort: 'model_default'
  });
}

export function ChangeStageModel(
  settings: Settings,
  stage: PipelineStage,
  model: string
): Settings {
  return UpdateStage(settings, stage, { model: model.trim() });
}

export function ChangeStageReasoningEffort(
  settings: Settings,
  stage: PipelineStage,
  reasoning_effort: ReasoningEffort
): Settings {
  return UpdateStage(settings, stage, { reasoning_effort });
}

// Sets the model the user picked and applies the effort suggested by that
// model's reasoning metadata in the loaded list.
export function PickStageModel(
  settings: Settings,
  stage: PipelineStage,
  model: string,
  models: ModelInfo[]
): Settings {
  const next_settings = ChangeStageModel(settings, stage, model);
  const picked_model = models.find(
    candidate => candidate.model_id === next_settings[stage].model
  );

  return ChangeStageReasoningEffort(
    next_settings,
    stage,
    SuggestReasoningEffort(stage, picked_model?.reasoning ?? null)
  );
}

export function SetTranslationSameAsImageReading(
  settings: Settings,
  is_same: boolean
): Settings {
  return {
    ...settings,
    translation: { ...settings.translation, is_same_as_image_reading: is_same }
  };
}

// A shared image-reading stage becomes a separate translation stage, so stage
// 2 keeps the model and reasoning effort it used (spec 0002 §2.2 and §9.3).
export function CopyImageReadingToTranslation(
  image_reading: StageProvider
): Settings['translation'] {
  return {
    is_same_as_image_reading: false,
    provider: image_reading.provider,
    model: image_reading.model,
    reasoning_effort: image_reading.reasoning_effort
  };
}

// Leaving the AI reader keeps the model that stage 2 used (spec 0002 §9.4).
export function ChangeImageReader(
  settings: Settings,
  reader: ImageReader
): Settings {
  if (settings.image_reading.reader === reader) return settings;

  const next_settings: Settings = {
    ...settings,
    image_reading: { ...settings.image_reading, reader }
  };

  if (reader === 'ai' || !IsTranslationSameAsImageReading(settings)) {
    return next_settings;
  }

  return {
    ...next_settings,
    translation: CopyImageReadingToTranslation(settings.image_reading)
  };
}
