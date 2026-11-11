import { AppError } from '@/lib/app-error';
import {
  OCR_DOCUMENT_JUSTIFICATION,
  OCR_DOCUMENT_PATH,
  OCR_IDLE_ALARM_NAME,
  OCR_IDLE_CLOSE_DELAY_MINUTES,
  OCR_OFFSCREEN_TARGET,
  OCR_REQUEST_TIMEOUT_MS
} from '../constants/ocr-offscreen';
import { IsOcrWarmUpReply } from '../lib/is-ocr-message';
import type { OcrReply, OcrRequest } from '../types/ocr-messages';

const NO_ANSWER_MESSAGE = 'On-device OCR did not answer.';
const INVALID_REPLY_MESSAGE = 'On-device OCR sent an invalid reply.';
const CANCELED_MESSAGE = 'The OCR request was canceled.';

export type OcrOffscreenClient = {
  SendRequest<TResult>(
    request: OcrRequest,
    IsReply: (reply: unknown) => reply is OcrReply<TResult>,
    signal: AbortSignal
  ): Promise<TResult>;
  HandleIdleAlarm(alarm: chrome.alarms.Alarm): Promise<void>; // never rejects
};

function CreateNoAnswerError(): AppError {
  return new AppError('OCR_UNAVAILABLE', NO_ANSWER_MESSAGE);
}

function CreateCanceledError(): AppError {
  return new AppError('CANCELED', CANCELED_MESSAGE);
}

// Owns the offscreen document that runs the OCR engine (spec 0002 §5.6). A
// request counts as in flight from its first line until it settles, and the
// idle alarm closes the document only when nothing is in flight.
export function CreateOcrOffscreenClient(): OcrOffscreenClient {
  let in_flight_count = 0;
  let ensure_promise: Promise<void> | null = null;
  let close_promise: Promise<void> | null = null;

  async function CloseOpenDocument(): Promise<void> {
    await chrome.offscreen.closeDocument();
  }

  // Closing rejects when no document is open, which is the state we want.
  function CloseDocument(): Promise<void> {
    close_promise ??= CloseOpenDocument()
      .catch(() => undefined)
      .finally(() => {
        close_promise = null;
      });

    return close_promise;
  }

  async function CreateDocumentIfMissing(): Promise<void> {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: OCR_DOCUMENT_PATH,
      reasons: ['WORKERS'],
      justification: OCR_DOCUMENT_JUSTIFICATION
    });
  }

  // A request that starts while the document closes waits for the close, then
  // opens a new document. Concurrent requests share one creation.
  async function EnsureDocument(): Promise<void> {
    await close_promise;
    ensure_promise ??= CreateDocumentIfMissing().finally(() => {
      ensure_promise = null;
    });
    await ensure_promise;
  }

  async function SendToDocument(request: OcrRequest): Promise<unknown> {
    try {
      await EnsureDocument();

      return await chrome.runtime.sendMessage(request);
    } catch {
      throw CreateNoAnswerError();
    }
  }

  // Settles on the first of: the reply, a send error, the timeout, or the
  // abort. Each one first stops the timer and the abort listener, so a
  // canceled request never closes the document later. Both reply handlers
  // stay attached, so a late result of an abandoned send settles nothing and
  // is never unhandled.
  function WaitForReply(
    reply_promise: Promise<unknown>,
    signal: AbortSignal
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout_id = setTimeout(() => {
        StopWaiting();
        void CloseDocument();
        reject(CreateNoAnswerError());
      }, OCR_REQUEST_TIMEOUT_MS);

      function StopWaiting(): void {
        clearTimeout(timeout_id);
        signal.removeEventListener('abort', HandleAbort);
      }

      function HandleAbort(): void {
        StopWaiting();
        reject(CreateCanceledError());
      }

      signal.addEventListener('abort', HandleAbort, { once: true });
      reply_promise.then(
        reply => {
          StopWaiting();
          resolve(reply);
        },
        (error: unknown) => {
          StopWaiting();
          reject(error);
        }
      );
    });
  }

  // A failed alarm leaves the document open longer; it changes no result.
  async function RecreateIdleAlarm(): Promise<void> {
    try {
      await chrome.alarms.create(OCR_IDLE_ALARM_NAME, {
        delayInMinutes: OCR_IDLE_CLOSE_DELAY_MINUTES
      });
    } catch (error) {
      console.warn('[background] ocr-idle-alarm', { outcome: 'failed', error });
    }
  }

  async function SendRequest<TResult>(
    request: OcrRequest,
    IsReply: (reply: unknown) => reply is OcrReply<TResult>,
    signal: AbortSignal
  ): Promise<TResult> {
    if (signal.aborted) throw CreateCanceledError();

    in_flight_count++;
    // Set at the start as well, so the document still closes if the service
    // worker stops during this request. While a request is in flight, the
    // alarm closes nothing.
    void RecreateIdleAlarm();

    try {
      const reply = await WaitForReply(SendToDocument(request), signal);

      if (!IsReply(reply)) {
        throw new AppError('OCR_UNAVAILABLE', INVALID_REPLY_MESSAGE);
      }

      if (!reply.ok) throw new AppError(reply.error_code, reply.message);

      return reply.result;
    } finally {
      in_flight_count--;
      void RecreateIdleAlarm();
    }
  }

  async function HandleIdleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== OCR_IDLE_ALARM_NAME || in_flight_count > 0) return;

    await CloseDocument();
  }

  return { SendRequest, HandleIdleAlarm };
}

// The service worker's client. Creating it touches no chrome.* API, so
// importing this module is safe in any page.
const shared_offscreen_client = CreateOcrOffscreenClient();

export function SendOcrRequest<TResult>(
  request: OcrRequest,
  IsReply: (reply: unknown) => reply is OcrReply<TResult>,
  signal: AbortSignal
): Promise<TResult> {
  return shared_offscreen_client.SendRequest(request, IsReply, signal);
}

export function HandleOcrIdleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  return shared_offscreen_client.HandleIdleAlarm(alarm);
}

export async function WarmUpOcr(signal: AbortSignal): Promise<void> {
  await SendOcrRequest(
    { target: OCR_OFFSCREEN_TARGET, action: 'ocr-warm-up' },
    IsOcrWarmUpReply,
    signal
  );
}
