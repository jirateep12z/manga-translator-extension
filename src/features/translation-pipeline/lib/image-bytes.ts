import { AppError } from '@/lib/app-error';
import { Base64ToBytes } from '@/lib/base64';
import type { CropRectPx, CssRect } from '../types/pipeline';

export function DecodeBase64ToBlob(
  image_base64: string,
  mime_type: string
): Blob {
  const read_error = new AppError(
    'IMAGE_FETCH_FAILED',
    'Unable to read this image.'
  );

  if (image_base64 === '') throw read_error;

  let bytes: Uint8Array<ArrayBuffer>;

  try {
    bytes = Base64ToBytes(image_base64);
  } catch {
    throw read_error;
  }

  return new Blob([bytes], { type: mime_type });
}

function Clamp(value: number, max_value: number): number {
  return Math.min(max_value, Math.max(0, value));
}

export function ComputeCaptureCropRect(
  rect_css_px: CssRect,
  device_pixel_ratio: number,
  bitmap_size: { width_px: number; height_px: number }
): CropRectPx | null {
  const left_px = Clamp(
    Math.round(rect_css_px.x * device_pixel_ratio),
    bitmap_size.width_px
  );
  const top_px = Clamp(
    Math.round(rect_css_px.y * device_pixel_ratio),
    bitmap_size.height_px
  );
  const right_px = Clamp(
    Math.round((rect_css_px.x + rect_css_px.width) * device_pixel_ratio),
    bitmap_size.width_px
  );
  const bottom_px = Clamp(
    Math.round((rect_css_px.y + rect_css_px.height) * device_pixel_ratio),
    bitmap_size.height_px
  );
  const width_px = right_px - left_px;
  const height_px = bottom_px - top_px;

  if (width_px <= 0 || height_px <= 0) return null;

  return { x_px: left_px, y_px: top_px, width_px, height_px };
}

export function ComputeCaptureDelayMs(
  last_capture_at_ms: number | null,
  now_ms: number,
  min_interval_ms: number
): number {
  if (last_capture_at_ms === null) return 0;

  return Math.max(0, last_capture_at_ms + min_interval_ms - now_ms);
}

export function WaitMs(
  duration_ms: number,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const CreateAbortError = () => new DOMException('Aborted', 'AbortError');

    if (signal.aborted) {
      reject(CreateAbortError());

      return;
    }

    const HandleAbort = () => {
      clearTimeout(timer_id);
      reject(CreateAbortError());
    };
    const timer_id = setTimeout(() => {
      signal.removeEventListener('abort', HandleAbort);
      resolve();
    }, duration_ms);

    signal.addEventListener('abort', HandleAbort, { once: true });
  });
}
