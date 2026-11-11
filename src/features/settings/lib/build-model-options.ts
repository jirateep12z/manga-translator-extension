import type { ModelInfo, PipelineStage } from '@/services/ai-provider';

export type ModelOption = { value: string; label: string };

export function BuildModelOptions(input: {
  models: ModelInfo[];
  stage: PipelineStage;
  current_model: string;
}): { options: ModelOption[]; is_vision_unknown: boolean } {
  const { models, stage, current_model } = input;
  const is_image_reading = stage === 'image_reading';
  const usable_models = models
    .filter(model => !is_image_reading || model.is_vision_capable !== false)
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));
  const options = usable_models.map(model => ({
    value: model.model_id,
    label: model.label
  }));
  const is_current_missing =
    current_model !== '' &&
    !options.some(option => option.value === current_model);

  return {
    options: is_current_missing
      ? [
          { value: current_model, label: `${current_model} (not in list)` },
          ...options
        ]
      : options,
    is_vision_unknown:
      is_image_reading &&
      usable_models.some(model => model.is_vision_capable === null)
  };
}
