import type { OcrEngine } from '@/features/ocr-engine';
import {
  IsOcrErrorCode,
  IsOcrOffscreenMessage,
  IsOcrRequest,
  type OcrReply,
  type OcrRequest
} from '@/features/ocr-reader';
import { IsAppError } from '@/lib/app-error';
import { Base64ToBytes } from '@/lib/base64';
import { IsOwnExtensionSender } from '@/lib/extension-sender';

const INVALID_OCR_REQUEST_MESSAGE = 'The OCR request is invalid.';
const PAGE_READ_FAILED_MESSAGE = 'The page could not be read.';
const OCR_START_FAILED_MESSAGE = 'On-device OCR could not start.';

type OcrMessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
) => boolean;

// Engine errors keep their code and message. Any other error becomes
// OCR_UNAVAILABLE during a warm-up and OCR_FAILED during a page read
// (spec 0002 §5.6).
function CreateFailureReply(
  request: OcrRequest,
  error: unknown
): OcrReply<never> {
  if (IsAppError(error) && IsOcrErrorCode(error.error_code)) {
    return { ok: false, error_code: error.error_code, message: error.message };
  }

  return request.action === 'ocr-warm-up'
    ? {
        ok: false,
        error_code: 'OCR_UNAVAILABLE',
        message: OCR_START_FAILED_MESSAGE
      }
    : {
        ok: false,
        error_code: 'OCR_FAILED',
        message: PAGE_READ_FAILED_MESSAGE
      };
}

async function RunRequest(
  engine: OcrEngine,
  request: OcrRequest
): Promise<OcrReply<unknown>> {
  try {
    if (request.action === 'ocr-warm-up') {
      return { ok: true, result: await engine.WarmUp() };
    }

    const image_blob = new Blob([Base64ToBytes(request.image_base64)], {
      type: request.mime_type
    });

    return { ok: true, result: await engine.ReadPage(image_blob) };
  } catch (error) {
    return CreateFailureReply(request, error);
  }
}

// Answers every message addressed to the OCR document by this extension, and
// ignores the messages meant for other listeners.
export function CreateOcrMessageHandler(engine: OcrEngine): OcrMessageHandler {
  return (message, sender, SendResponse) => {
    if (!IsOcrOffscreenMessage(message) || !IsOwnExtensionSender(sender)) {
      return false;
    }

    if (!IsOcrRequest(message)) {
      SendResponse({
        ok: false,
        error_code: 'OCR_FAILED',
        message: INVALID_OCR_REQUEST_MESSAGE
      });

      return false;
    }

    RunRequest(engine, message)
      .then(SendResponse)
      .catch((error: unknown) => {
        console.warn('[offscreen] ocr-reply', { outcome: 'failed', error });
      });

    return true;
  };
}
