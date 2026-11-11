import type { ErrorCode } from '@/types/error-code';

export const STOP_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'NOT_CONFIGURED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_CREDIT_EXHAUSTED',
  'OLLAMA_UNREACHABLE',
  'OLLAMA_ORIGIN_BLOCKED',
  'MODEL_NOT_FOUND',
  'STORAGE_QUOTA_EXCEEDED',
  'OCR_UNAVAILABLE'
]);

export const MAX_PAGE_RESENDS = 1;
export const CAPTURE_RESTORE_TIMEOUT_MS = 5000;
