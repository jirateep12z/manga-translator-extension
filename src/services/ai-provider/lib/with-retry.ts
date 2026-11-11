import { IsAppError } from '@/lib/app-error';
import type { ErrorCode } from '@/types/error-code';

export const RETRY_DELAYS_MS = [1000, 2000, 4000];
export const MAX_RETRY_JITTER_MS = 250;
export const MAX_RETRY_AFTER_MS = 60_000;

const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE'
]);

function Sleep(delay_ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);

      return;
    }

    const HandleAbort = () => {
      clearTimeout(timer_id);
      reject(signal.reason);
    };
    const timer_id = setTimeout(() => {
      signal.removeEventListener('abort', HandleAbort);
      resolve();
    }, delay_ms);

    signal.addEventListener('abort', HandleAbort, { once: true });
  });
}

export async function WithRetry<T>(
  operation: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      const is_retryable =
        IsAppError(error) &&
        RETRYABLE_ERROR_CODES.has(error.error_code) &&
        attempt < RETRY_DELAYS_MS.length;

      if (!is_retryable) throw error;

      const delay_ms =
        error.retry_after_ms ??
        RETRY_DELAYS_MS[attempt] +
          Math.floor(Math.random() * MAX_RETRY_JITTER_MS);

      if (delay_ms > MAX_RETRY_AFTER_MS) throw error;
      await Sleep(delay_ms, signal);
    }
  }
}
