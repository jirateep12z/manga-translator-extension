import type { ErrorCode } from '@/types/error-code';
import type { QueueStatus } from '../types/queue';

export type ErrorMessage = {
  message: string;
  action: 'open-settings' | 'retry' | null;
};

export const ERROR_MESSAGES: Record<ErrorCode, ErrorMessage> = {
  NOT_CONFIGURED: {
    message: 'Set up a provider in Settings.',
    action: 'open-settings'
  },
  PROVIDER_AUTH_FAILED: {
    message: 'Check your OpenRouter API key.',
    action: 'open-settings'
  },
  PROVIDER_CREDIT_EXHAUSTED: {
    message: 'Your OpenRouter credit has run out.',
    action: 'open-settings'
  },
  PROVIDER_CONTENT_REJECTED: {
    message: 'The provider refused this page. Try another model.',
    action: 'retry'
  },
  PROVIDER_RATE_LIMITED: {
    message: 'The provider is busy. Try again shortly.',
    action: 'retry'
  },
  PROVIDER_UNAVAILABLE: {
    message: "The provider isn't responding.",
    action: 'retry'
  },
  OLLAMA_UNREACHABLE: {
    message:
      "Ollama isn't reachable. Check that it is running and the URL in Settings.",
    action: 'open-settings'
  },
  OLLAMA_ORIGIN_BLOCKED: {
    message: 'Ollama blocked the request. Set OLLAMA_ORIGINS.',
    action: 'open-settings'
  },
  MODEL_NOT_FOUND: {
    message: "The selected model isn't available.",
    action: 'open-settings'
  },
  INVALID_MODEL_RESPONSE: {
    message: 'The model returned an unreadable result.',
    action: 'retry'
  },
  IMAGE_FETCH_FAILED: {
    message: 'Scroll to this image and select Retry.',
    action: 'retry'
  },
  STORAGE_QUOTA_EXCEEDED: {
    message: 'Storage is full. Clear the cache in Settings.',
    action: 'open-settings'
  },
  OCR_UNAVAILABLE: {
    message:
      "On-device OCR couldn't start. Reload the extension, or choose AI model as the reader in Settings.",
    action: 'open-settings'
  },
  OCR_FAILED: { message: "This page couldn't be read.", action: 'retry' },
  NOT_CACHED: { message: 'Not translated yet.', action: null },
  CANCELED: { message: 'Canceled.', action: null }
};

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  idle: 'Ready',
  'confirming-series': 'Confirm series',
  translating: 'Translating',
  paused: 'Paused',
  completed: 'Done',
  stopped: 'Stopped',
  error: 'Error'
};

export const CACHE_ONLY_STATUS_LABEL = 'Loading saved translations';

export const MAX_RANKED_SERIES_CHOICES = 5;
