// Thin canvas adapter (spec 0002 §15.1); the parity check of Plan 0009
// Task 19 covers it.
import { AppError } from '@/lib/app-error';
import {
  IMAGE_DECODE_FAILED_MESSAGE,
  PAGE_READ_FAILED_MESSAGE
} from '../constants/ocr-engine';
import { ComputeCropTransform, MeasureQuadCrop } from '../lib/quad-geometry';
import { WriteBgrPlanes } from '../lib/write-bgr-planes';
import type {
  DetectionInputSize,
  DetectionTile,
  PixelNormalization,
  RecognitionBatch,
  RecognitionCrop
} from '../types/ocr-engine';

const BACKGROUND_COLOR = '#ffffff';
const PLANE_COUNT = 3;
const RESIZE_QUALITY: ResizeQuality = 'high';
const SMOOTHING_QUALITY: ImageSmoothingQuality = 'high';
const QUARTER_TURN_RADIANS = Math.PI / 2;

function CreateWhiteCanvas(
  width_px: number,
  height_px: number
): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(width_px, height_px);
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new AppError('OCR_FAILED', PAGE_READ_FAILED_MESSAGE);
  }

  context.fillStyle = BACKGROUND_COLOR;
  context.fillRect(0, 0, width_px, height_px);

  return { canvas, context };
}

/** Decodes a page image. A failure becomes OCR_FAILED (spec 0002 §6.3). */
export async function DecodePageImage(image_blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image_blob);
  } catch {
    throw new AppError('OCR_FAILED', IMAGE_DECODE_FAILED_MESSAGE);
  }
}

/** Creates a white image, used to warm up the models (spec 0002 §6.6). */
export async function CreateWhiteImage(
  width_px: number,
  height_px: number
): Promise<ImageBitmap> {
  const { canvas } = CreateWhiteCanvas(width_px, height_px);

  return canvas.transferToImageBitmap();
}

/**
 * Builds the detection input of one tile (spec 0002 §6.3, "Input tensor"):
 * the tile resized to input_size on a white canvas, as normalized BGR planes.
 */
export async function BuildDetectionInput(
  image: ImageBitmap,
  tile: DetectionTile,
  input_size: DetectionInputSize,
  normalization: PixelNormalization
): Promise<Float32Array> {
  const { width_px, height_px } = input_size;
  const tile_bitmap = await createImageBitmap(
    image,
    tile.source_x_px,
    tile.source_y_px,
    tile.source_width_px,
    tile.source_height_px,
    {
      resizeWidth: width_px,
      resizeHeight: height_px,
      resizeQuality: RESIZE_QUALITY
    }
  );

  try {
    const { context } = CreateWhiteCanvas(width_px, height_px);

    context.drawImage(tile_bitmap, 0, 0);

    const image_data = context.getImageData(0, 0, width_px, height_px);
    const tensor_data = new Float32Array(PLANE_COUNT * height_px * width_px);

    WriteBgrPlanes({
      rgba: image_data.data,
      width_px,
      height_px,
      normalization,
      target: tensor_data,
      target_offset: 0,
      target_width_px: width_px
    });

    return tensor_data;
  } finally {
    tile_bitmap.close();
  }
}

// Spec 0002 §6.4 step 1: warps the line's quad upright, at the crop's own
// size. Only the line's box is drawn, and a straight box is copied as it is.
async function CropUpright(
  image: ImageBitmap,
  crop: RecognitionCrop
): Promise<ImageBitmap> {
  const { bbox_px, quad_px } = crop;
  const crop_size = MeasureQuadCrop(quad_px);
  const { canvas, context } = CreateWhiteCanvas(
    crop_size.width_px,
    crop_size.height_px
  );

  context.imageSmoothingQuality = SMOOTHING_QUALITY;
  context.setTransform(
    ComputeCropTransform(quad_px, crop_size, {
      x_px: bbox_px.x_px,
      y_px: bbox_px.y_px
    })
  );
  context.drawImage(
    image,
    bbox_px.x_px,
    bbox_px.y_px,
    bbox_px.width_px,
    bbox_px.height_px,
    0,
    0,
    bbox_px.width_px,
    bbox_px.height_px
  );

  return canvas.transferToImageBitmap();
}

// A vertical crop is resized with its sides swapped, then turned 90°
// counter-clockwise onto the canvas, so it reads like a horizontal line.
async function DrawResizedCrop(
  upright_bitmap: ImageBitmap,
  crop: RecognitionCrop,
  image_height_px: number
): Promise<ImageData> {
  const { is_vertical, resized_width_px } = crop;
  const crop_bitmap = await createImageBitmap(upright_bitmap, {
    resizeWidth: is_vertical ? image_height_px : resized_width_px,
    resizeHeight: is_vertical ? resized_width_px : image_height_px,
    resizeQuality: RESIZE_QUALITY
  });

  try {
    const { context } = CreateWhiteCanvas(resized_width_px, image_height_px);

    if (is_vertical) {
      context.translate(0, image_height_px);
      context.rotate(-QUARTER_TURN_RADIANS);
    }

    context.drawImage(crop_bitmap, 0, 0);

    return context.getImageData(0, 0, resized_width_px, image_height_px);
  } finally {
    crop_bitmap.close();
  }
}

async function DrawRecognitionCrop(
  image: ImageBitmap,
  crop: RecognitionCrop,
  image_height_px: number
): Promise<ImageData> {
  const upright_bitmap = await CropUpright(image, crop);

  try {
    return await DrawResizedCrop(upright_bitmap, crop, image_height_px);
  } finally {
    upright_bitmap.close();
  }
}

/**
 * Builds the recognition input of one batch (spec 0002 §6.4 steps 1, 2, and
 * 4): each crop warped upright, then resized to image_height_px, as
 * normalized BGR planes, with zeros to the right of crops narrower than the
 * batch.
 */
export async function BuildRecognitionInput(
  image: ImageBitmap,
  batch: RecognitionBatch,
  image_height_px: number,
  normalization: PixelNormalization
): Promise<Float32Array> {
  const item_size = PLANE_COUNT * image_height_px * batch.width_px;
  const tensor_data = new Float32Array(batch.crops.length * item_size);

  for (const [crop_index, crop] of batch.crops.entries()) {
    const image_data = await DrawRecognitionCrop(image, crop, image_height_px);

    WriteBgrPlanes({
      rgba: image_data.data,
      width_px: crop.resized_width_px,
      height_px: image_height_px,
      normalization,
      target: tensor_data,
      target_offset: crop_index * item_size,
      target_width_px: batch.width_px
    });
  }

  return tensor_data;
}
