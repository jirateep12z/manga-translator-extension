import { AppError, IsAppError } from '@/lib/app-error';
import {
  CAPTURE_MIN_INTERVAL_MS,
  CAPTURE_QUEUE_KEY
} from '../constants/pipeline';
import { ComputeCaptureDelayMs, WaitMs } from '../lib/image-bytes';
import { CreateKeyedSerialQueue } from '../lib/keyed-serial-queue';
import type { CssRect } from '../types/pipeline';
import { CropCaptureToJpegBlob } from './image-codec.service';

const RunCaptureSerialized = CreateKeyedSerialQueue();
let last_capture_at_ms: number | null = null;

export function CaptureVisibleImage(input: {
  tab_id: number;
  window_id: number;
  rect_css_px: CssRect;
  device_pixel_ratio: number;
  signal: AbortSignal;
}): Promise<Blob> {
  return RunCaptureSerialized(CAPTURE_QUEUE_KEY, async () => {
    try {
      const tab = await chrome.tabs.get(input.tab_id);

      if (!tab.active)
        throw new AppError(
          'IMAGE_FETCH_FAILED',
          'Open the tab to capture this image.'
        );
      await WaitMs(
        ComputeCaptureDelayMs(
          last_capture_at_ms,
          Date.now(),
          CAPTURE_MIN_INTERVAL_MS
        ),
        input.signal
      );
      last_capture_at_ms = Date.now();

      const data_url = await chrome.tabs.captureVisibleTab(input.window_id, {
        format: 'png'
      });

      return await CropCaptureToJpegBlob(
        data_url,
        input.rect_css_px,
        input.device_pixel_ratio
      );
    } catch (error) {
      if (
        IsAppError(error) ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;

      throw new AppError('IMAGE_FETCH_FAILED', 'Unable to capture this image.');
    }
  });
}
