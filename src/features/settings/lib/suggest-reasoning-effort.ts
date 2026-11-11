import type { ModelReasoning, PipelineStage } from '@/services/ai-provider';
import type { ReasoningEffort } from '../types/settings';

// Applied when the user picks a model. Translation asks for the least
// thinking the model allows; the AI image reader asks for low.
export function SuggestReasoningEffort(
  stage: PipelineStage,
  reasoning: ModelReasoning | null
): ReasoningEffort {
  if (!reasoning) return 'model_default';

  if (stage === 'image_reading') {
    return reasoning.supported_efforts.includes('low')
      ? 'low'
      : 'model_default';
  }

  if (!reasoning.is_mandatory) return 'none';

  return reasoning.supported_efforts.at(0) ?? 'model_default';
}
