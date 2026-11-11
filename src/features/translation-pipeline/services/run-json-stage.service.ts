import { AppError } from '@/lib/app-error';
import {
  WithRetry,
  type AiProvider,
  type CompletionRequest
} from '@/services/ai-provider';
import { CORRECTION_PREFIX, CORRECTION_SUFFIX } from '../constants/prompts';
import { ParseModelJson } from '../lib/parse-model-json';
import type { ValidationResult } from '../types/pipeline';

type RunJsonStageInput<T> = {
  provider: AiProvider;
  request: CompletionRequest;
  Validate: (raw: unknown) => ValidationResult<T>;
  signal: AbortSignal;
};

type AttemptResult<T> =
  | { is_valid: true; value: T; model: string }
  | { is_valid: false; error: string };

async function RunAttempt<T>(
  input: RunJsonStageInput<T>,
  request: CompletionRequest
): Promise<AttemptResult<T>> {
  const completion = await WithRetry(
    () => input.provider.CreateCompletion(request, input.signal),
    input.signal
  );
  const parsed = ParseModelJson(completion.text);

  if (!parsed.is_valid) return parsed;

  const validated = input.Validate(parsed.value);

  return validated.is_valid
    ? { is_valid: true, value: validated.value, model: completion.model }
    : validated;
}

export async function RunJsonStage<T>(
  input: RunJsonStageInput<T>
): Promise<{ value: T; model: string }> {
  const first_attempt = await RunAttempt(input, input.request);

  if (first_attempt.is_valid) {
    return { value: first_attempt.value, model: first_attempt.model };
  }

  const second_attempt = await RunAttempt(input, {
    ...input.request,
    user_text: `${input.request.user_text}\n\n${CORRECTION_PREFIX} ${first_attempt.error} ${CORRECTION_SUFFIX}`
  });

  if (second_attempt.is_valid) {
    return { value: second_attempt.value, model: second_attempt.model };
  }

  throw new AppError(
    'INVALID_MODEL_RESPONSE',
    'The model returned an unreadable result.'
  );
}
