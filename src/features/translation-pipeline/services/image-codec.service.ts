import type { RgbaImage } from '@/features/region-appearance';
import { AppError } from '@/lib/app-error';
import { ArrayBufferToBase64 } from '@/lib/base64';
import {
  JPEG_QUALITY,
  SNAP_MAX_IMAGE_PIXELS,
  SNAP_MAX_IMAGE_WIDTH_PX
} from '../constants/pipeline';
import { ConvertRgbaToGray } from '../lib/convert-rgba-to-gray';
import { ComputeCaptureCropRect } from '../lib/image-bytes';
import type { GrayImage } from '../lib/snap-region-boxes';
import type { CssRect, ImageTile } from '../types/pipeline';

const IMAGE_READ_FAILED_MESSAGE = 'Unable to read this image.';

// Parameters<typeof createImageBitmap> resolves only the last overload, so the
// decode call is passed in instead of forwarding its arguments.
async function DecodeBitmap(
  Decode: () => Promise<ImageBitmap>
): Promise<ImageBitmap> {
  try {
    return await Decode();
  } catch {
    throw new AppError('IMAGE_FETCH_FAILED', IMAGE_READ_FAILED_MESSAGE);
  }
}

async function EncodeJpeg(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  width_px: number,
  height_px: number
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width_px, height_px);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new AppError('IMAGE_FETCH_FAILED', IMAGE_READ_FAILED_MESSAGE);
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width_px, height_px);
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width_px, height_px);

  return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
}

export async function ReadImageSize(
  image_blob: Blob
): Promise<{ width_px: number; height_px: number }> {
  const bitmap = await DecodeBitmap(() => createImageBitmap(image_blob));

  try {
    return { width_px: bitmap.width, height_px: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** The scale at which a page is decoded for analysis; 1 keeps full size. */
function ComputeDecodeScale(width_px: number, height_px: number): number {
  return Math.min(
    1,
    SNAP_MAX_IMAGE_WIDTH_PX / width_px,
    Math.sqrt(SNAP_MAX_IMAGE_PIXELS / (width_px * height_px))
  );
}

/**
 * Decodes a page into RGBA pixels on a white background. Large pages are
 * scaled down; `scale` maps original pixels to decoded pixels.
 */
export async function ReadRgbaImage(image_blob: Blob): Promise<{
  image: RgbaImage;
  scale: number;
  natural_width_px: number;
  natural_height_px: number;
}> {
  const source_bitmap = await DecodeBitmap(() => createImageBitmap(image_blob));
  const scale = ComputeDecodeScale(source_bitmap.width, source_bitmap.height);
  const width_px = Math.max(1, Math.round(source_bitmap.width * scale));
  const height_px = Math.max(1, Math.round(source_bitmap.height * scale));

  try {
    const canvas = new OffscreenCanvas(width_px, height_px);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      throw new AppError('IMAGE_FETCH_FAILED', IMAGE_READ_FAILED_MESSAGE);
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width_px, height_px);
    context.drawImage(source_bitmap, 0, 0, width_px, height_px);

    const image_data = context.getImageData(0, 0, width_px, height_px);

    return {
      image: { pixels: image_data.data, width_px, height_px },
      scale: width_px / source_bitmap.width,
      natural_width_px: source_bitmap.width,
      natural_height_px: source_bitmap.height
    };
  } finally {
    source_bitmap.close();
  }
}

/**
 * Decodes a page into one gray value per pixel. Large pages are scaled down;
 * `scale` maps original pixels to decoded pixels.
 */
export async function ReadGrayImage(
  image_blob: Blob
): Promise<{ image: GrayImage; scale: number }> {
  const { image, scale } = await ReadRgbaImage(image_blob);
  const pixels = ConvertRgbaToGray(
    image.pixels,
    image.width_px,
    image.height_px
  );

  return {
    image: { pixels, width_px: image.width_px, height_px: image.height_px },
    scale
  };
}

export async function EncodeTileAsJpegBase64(
  image_blob: Blob,
  tile: ImageTile
): Promise<string> {
  const bitmap = await DecodeBitmap(() =>
    createImageBitmap(
      image_blob,
      tile.source_x_px,
      tile.source_y_px,
      tile.source_width_px,
      tile.source_height_px,
      {
        resizeWidth: tile.output_width_px,
        resizeHeight: tile.output_height_px,
        resizeQuality: 'high'
      }
    )
  );

  try {
    const jpeg_blob = await EncodeJpeg(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      tile.output_width_px,
      tile.output_height_px
    );

    return ArrayBufferToBase64(await jpeg_blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function CropCaptureToJpegBlob(
  data_url: string,
  rect_css_px: CssRect,
  device_pixel_ratio: number
): Promise<Blob> {
  const capture_blob = await (await fetch(data_url)).blob();
  const bitmap = await DecodeBitmap(() => createImageBitmap(capture_blob));

  try {
    const crop = ComputeCaptureCropRect(rect_css_px, device_pixel_ratio, {
      width_px: bitmap.width,
      height_px: bitmap.height
    });

    if (!crop) {
      throw new AppError('IMAGE_FETCH_FAILED', 'The image is not visible.');
    }

    return await EncodeJpeg(
      bitmap,
      crop.x_px,
      crop.y_px,
      crop.width_px,
      crop.height_px,
      crop.width_px,
      crop.height_px
    );
  } finally {
    bitmap.close();
  }
}
