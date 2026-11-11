import { AppError } from '@/lib/app-error';
import { IsRecord } from '@/lib/is-record';

function IsQuotaError(error: unknown): boolean {
  return IsRecord(error) && error.name === 'QuotaExceededError';
}

export async function WithQuotaRecovery<T>(
  Operation: () => Promise<T>,
  Recover: () => Promise<void>
): Promise<T> {
  try {
    return await Operation();
  } catch (error) {
    if (!IsQuotaError(error)) throw error;
  }

  await Recover();
  try {
    return await Operation();
  } catch (error) {
    if (!IsQuotaError(error)) throw error;

    throw new AppError(
      'STORAGE_QUOTA_EXCEEDED',
      'Storage is full. Clear the cache in Settings.'
    );
  }
}
