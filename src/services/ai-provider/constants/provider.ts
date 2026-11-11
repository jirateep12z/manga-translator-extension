import type { ReasoningEffortLevel } from '../types/provider';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
// Ollama's default context can be 4096 tokens for prompt and answer together,
// which cuts the JSON answer of a dense page short. Every request, including
// the warm-up, uses the same size so Ollama does not reload the model.
export const OLLAMA_CONTEXT_TOKENS = 8192;
export const VALID_PROVIDER_NAMES: ReadonlySet<string> = new Set([
  'openrouter',
  'ollama'
]);
// Canonical order, from no reasoning to the most.
export const REASONING_EFFORT_LEVELS: readonly ReasoningEffortLevel[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
];
