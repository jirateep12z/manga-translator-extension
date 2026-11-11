import {
  ArrayBufferToBase64,
  ClassifyImageSource,
  ParseDataUrl
} from '@/features/page-scanner';
import { CreateCaptureRect, type ViewportRect } from '../lib/capture-geometry';
import type { ImageSource } from '../types/port-messages';

// The image's referrerpolicy under which the page sends no Referer for it.
const NO_REFERRER_POLICY = 'no-referrer';

export async function ReadInlineImage(
  source: string
): Promise<{ image_base64: string; mime_type: string } | null> {
  try {
    if (/^data:/i.test(source)) return ParseDataUrl(source);

    const response = await fetch(source);

    if (!response.ok) return null;

    const blob = await response.blob();

    if (!blob.type.startsWith('image/')) return null;

    return {
      image_base64: ArrayBufferToBase64(await blob.arrayBuffer()),
      mime_type: blob.type
    };
  } catch {
    return null;
  }
}

export async function ResolveImageSource(input: {
  effective_source: string;
  referrer_policy: string;
  use_capture: boolean;
  viewport_rect: ViewportRect;
  device_pixel_ratio: number;
}): Promise<ImageSource | null> {
  if (input.use_capture) {
    return {
      type: 'capture',
      image_url: input.effective_source,
      rect_css_px: CreateCaptureRect(input.viewport_rect),
      device_pixel_ratio: input.device_pixel_ratio
    };
  }

  switch (ClassifyImageSource(input.effective_source)) {
    case 'url':
      return {
        type: 'url',
        image_url: input.effective_source,
        is_referrer_hidden: input.referrer_policy === NO_REFERRER_POLICY
      };
    case 'inline': {
      const inline_image = await ReadInlineImage(input.effective_source);

      return inline_image ? { type: 'inline', ...inline_image } : null;
    }

    default:
      return null;
  }
}
