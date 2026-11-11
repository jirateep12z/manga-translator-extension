import type {
  ModelInfo,
  ProviderName,
  ReasoningEffortLevel
} from '@/services/ai-provider';
import type { ReasoningEffort } from '../types/settings';

export type ReasoningOption = { value: ReasoningEffort; label: string };

export type ReasoningOptions = {
  is_visible: boolean;
  options: ReasoningOption[];
  is_current_unsupported: boolean;
};

const REASONING_EFFORT_LABELS: Record<ReasoningEffortLevel, string> = {
  none: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
};

// Only OpenRouter reports reasoning metadata, and only for models in the
// loaded list, so the Thinking field stays hidden in every other case.
export function BuildReasoningOptions(input: {
  provider: ProviderName;
  models: ModelInfo[];
  current_model: string;
  current_effort: ReasoningEffort;
}): ReasoningOptions {
  const reasoning =
    input.provider === 'openrouter'
      ? input.models.find(model => model.model_id === input.current_model)
          ?.reasoning
      : null;

  if (!reasoning) {
    return { is_visible: false, options: [], is_current_unsupported: false };
  }

  const options: ReasoningOption[] = [
    {
      value: 'model_default',
      label:
        reasoning.default_effort === null
          ? 'Model default'
          : `Model default (${REASONING_EFFORT_LABELS[reasoning.default_effort]})`
    },
    ...(reasoning.is_mandatory
      ? []
      : [{ value: 'none' as const, label: REASONING_EFFORT_LABELS.none }]),
    ...reasoning.supported_efforts.map(level => ({
      value: level,
      label: REASONING_EFFORT_LABELS[level]
    }))
  ];
  const { current_effort } = input;

  if (
    current_effort === 'model_default' ||
    options.some(option => option.value === current_effort)
  ) {
    return { is_visible: true, options, is_current_unsupported: false };
  }

  // Keep the stored choice visible instead of silently replacing it.
  return {
    is_visible: true,
    options: [
      ...options,
      {
        value: current_effort,
        label: `${REASONING_EFFORT_LABELS[current_effort]} (not supported by this model)`
      }
    ],
    is_current_unsupported: true
  };
}
