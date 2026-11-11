import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsRecord } from '@/lib/is-record';
import { SERIES_DETECTION_ERROR_MESSAGES } from '../constants/series-detection';
import {
  IsConfirmSeriesMessage,
  IsDetectSeriesMessage
} from '../lib/message-guards';
import type {
  ConfirmSeriesResponse,
  DetectSeriesResponse,
  ListSeriesResponse
} from '../types/message';
import {
  ConfirmSeries,
  DetectSeries,
  ListSeriesSummaries,
  SeriesNotFoundError
} from './series-detection.service';

type SendResponseCallback = (response: unknown) => void;

function LogFailure(
  operation: string,
  hostname: string | null,
  error: unknown
): void {
  console.error('[background] series-detection', {
    operation,
    hostname,
    outcome: 'failed',
    error
  });
}

function HandleDetectSeries(
  message: unknown,
  SendResponse: SendResponseCallback
): boolean {
  if (!IsDetectSeriesMessage(message)) {
    SendResponse({
      status: 'error',
      error: SERIES_DETECTION_ERROR_MESSAGES.INVALID_PAGE_INFO
    } satisfies DetectSeriesResponse);

    return false;
  }

  DetectSeries(message.page_info)
    .then(result => SendResponse(result satisfies DetectSeriesResponse))
    .catch(error => {
      LogFailure('detect-series', message.page_info.hostname, error);
      SendResponse({
        status: 'error',
        error: SERIES_DETECTION_ERROR_MESSAGES.DETECT_FAILED
      } satisfies DetectSeriesResponse);
    });

  return true;
}

function HandleConfirmSeries(
  message: unknown,
  SendResponse: SendResponseCallback
): boolean {
  if (!IsConfirmSeriesMessage(message)) {
    SendResponse({
      success: false,
      error: SERIES_DETECTION_ERROR_MESSAGES.INVALID_CONFIRMATION
    } satisfies ConfirmSeriesResponse);

    return false;
  }

  ConfirmSeries(message)
    .then(series =>
      SendResponse({ success: true, series } satisfies ConfirmSeriesResponse)
    )
    .catch(error => {
      if (!(error instanceof SeriesNotFoundError)) {
        LogFailure('confirm-series', message.page_info.hostname, error);
      }

      SendResponse({
        success: false,
        error:
          error instanceof SeriesNotFoundError
            ? SERIES_DETECTION_ERROR_MESSAGES.SERIES_NOT_FOUND
            : SERIES_DETECTION_ERROR_MESSAGES.CONFIRM_FAILED
      } satisfies ConfirmSeriesResponse);
    });

  return true;
}

function HandleListSeries(SendResponse: SendResponseCallback): boolean {
  ListSeriesSummaries()
    .then(series => SendResponse({ series } satisfies ListSeriesResponse))
    .catch(error => {
      LogFailure('list-series', null, error);
      SendResponse({ series: [] } satisfies ListSeriesResponse);
    });

  return true;
}

export function HandleSeriesDetectionMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: SendResponseCallback
): boolean {
  if (!IsOwnExtensionSender(sender) || !IsRecord(message)) return false;

  switch (message.action) {
    case 'detect-series':
      return HandleDetectSeries(message, SendResponse);
    case 'confirm-series':
      return HandleConfirmSeries(message, SendResponse);
    case 'list-series':
      return HandleListSeries(SendResponse);
    default:
      return false;
  }
}
