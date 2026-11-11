import type { ErrorCode } from '@/types/error-code';

const SUMMARIZE_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_CONFIGURED: 'Set up a provider in Settings first.',
  PROVIDER_AUTH_FAILED: 'Check your OpenRouter API key in Settings.',
  OLLAMA_UNREACHABLE: "Ollama isn't reachable. Make sure it's running."
};
const DEFAULT_SUMMARIZE_ERROR_MESSAGE =
  "Couldn't summarize this chapter. Try again.";

export function DescribeSummarizeError(error_code: ErrorCode): string {
  return (
    SUMMARIZE_ERROR_MESSAGES[error_code] ?? DEFAULT_SUMMARIZE_ERROR_MESSAGE
  );
}
