import type { ErrorCode } from '@/types/error-code';
import { IsRecord } from './is-record';

export class AppError extends Error {
  readonly error_code: ErrorCode;
  readonly retry_after_ms: number | null;

  constructor(
    error_code: ErrorCode,
    message: string,
    retry_after_ms: number | null = null
  ) {
    super(message);
    this.name = 'AppError';
    this.error_code = error_code;
    this.retry_after_ms = retry_after_ms;
  }
}

export function IsAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function ToErrorCode(error: unknown): ErrorCode {
  if (IsAppError(error)) return error.error_code;
  if (IsRecord(error) && error.name === 'AbortError') return 'CANCELED';

  return 'PROVIDER_UNAVAILABLE';
}
