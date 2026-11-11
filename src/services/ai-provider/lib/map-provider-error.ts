import { AppError } from '@/lib/app-error';
import { IsRecord } from '@/lib/is-record';
import type { ErrorCode } from '@/types/error-code';
import type { ProviderName } from '../types/provider';

const RETRY_AFTER_SECONDS_PATTERN = /^\d+$/;
const MODEL_MESSAGE_PATTERN = /model/i;
const NOT_FOUND_MESSAGE_PATTERN = /not found/i;

const USER_MESSAGES: Record<ErrorCode, string> = {
  NOT_CONFIGURED: 'Set up a provider in Settings.',
  PROVIDER_AUTH_FAILED: 'Check your OpenRouter API key.',
  PROVIDER_CREDIT_EXHAUSTED: 'Your OpenRouter credit has run out.',
  PROVIDER_CONTENT_REJECTED:
    'The provider refused this page. Try another model.',
  PROVIDER_RATE_LIMITED: 'The provider is busy. Try again shortly.',
  PROVIDER_UNAVAILABLE: "The provider isn't responding.",
  OLLAMA_UNREACHABLE: "Ollama isn't reachable at the configured URL.",
  OLLAMA_ORIGIN_BLOCKED: 'Ollama blocked the request. Set OLLAMA_ORIGINS.',
  MODEL_NOT_FOUND: "The selected model isn't available.",
  INVALID_MODEL_RESPONSE: 'The model returned an unreadable result.',
  IMAGE_FETCH_FAILED: 'Scroll to this image and select Retry.',
  STORAGE_QUOTA_EXCEEDED: 'Storage is full. Clear the cache in Settings.',
  OCR_UNAVAILABLE:
    "On-device OCR couldn't start. Reload the extension, or choose AI model as the reader in Settings.",
  OCR_FAILED: "This page couldn't be read.",
  NOT_CACHED: 'Not translated yet.',
  CANCELED: 'Canceled.'
};

function CreateProviderError(
  error_code: ErrorCode,
  retry_after_ms: number | null = null
): AppError {
  return new AppError(error_code, USER_MESSAGES[error_code], retry_after_ms);
}

export function ParseRetryAfterMs(
  retry_after_header: string | null,
  now_ms: number
): number | null {
  if (retry_after_header === null) return null;

  const trimmed_header = retry_after_header.trim();

  if (RETRY_AFTER_SECONDS_PATTERN.test(trimmed_header)) {
    return Number(trimmed_header) * 1000;
  }

  const date_ms = Date.parse(trimmed_header);

  return Number.isNaN(date_ms) ? null : Math.max(0, date_ms - now_ms);
}

export function MapOpenRouterStatus(
  status: number,
  message: string,
  retry_after_header: string | null
): AppError {
  switch (status) {
    case 401:
      return CreateProviderError('PROVIDER_AUTH_FAILED');
    case 402:
      return CreateProviderError('PROVIDER_CREDIT_EXHAUSTED');
    case 403:
      return CreateProviderError('PROVIDER_CONTENT_REJECTED');
    case 404:
      return CreateProviderError('MODEL_NOT_FOUND');
    case 429:
      return CreateProviderError(
        'PROVIDER_RATE_LIMITED',
        ParseRetryAfterMs(retry_after_header, Date.now())
      );
    default:
      return status === 400 && MODEL_MESSAGE_PATTERN.test(message)
        ? CreateProviderError('MODEL_NOT_FOUND')
        : CreateProviderError('PROVIDER_UNAVAILABLE');
  }
}

export function MapOllamaStatus(status: number, _message: string): AppError {
  switch (status) {
    case 403:
      return CreateProviderError('OLLAMA_ORIGIN_BLOCKED');
    case 404:
      return CreateProviderError('MODEL_NOT_FOUND');
    case 429:
      return CreateProviderError('PROVIDER_RATE_LIMITED');
    default:
      return CreateProviderError('PROVIDER_UNAVAILABLE');
  }
}

export function MapOllamaStreamError(message: string): AppError {
  return NOT_FOUND_MESSAGE_PATTERN.test(message)
    ? CreateProviderError('MODEL_NOT_FOUND')
    : CreateProviderError('PROVIDER_UNAVAILABLE');
}

export function ToProviderFetchError(
  error: unknown,
  provider: ProviderName
): Error {
  if (error instanceof AppError) return error;
  if (IsRecord(error) && error.name === 'AbortError') {
    return error as unknown as Error;
  }

  return CreateProviderError(
    provider === 'ollama' ? 'OLLAMA_UNREACHABLE' : 'PROVIDER_UNAVAILABLE'
  );
}
