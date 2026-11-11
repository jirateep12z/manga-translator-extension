import type { ErrorCode } from '@/types/error-code';
import { ERROR_MESSAGES, type ErrorMessage } from '../constants/panel';

export function ResolveErrorMessage(error_code: ErrorCode): ErrorMessage {
  return ERROR_MESSAGES[error_code];
}
