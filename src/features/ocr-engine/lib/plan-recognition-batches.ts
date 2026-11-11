import { RECOGNITION_BATCH_SIZE } from '../constants/ocr-engine';
import type {
  RecognitionBatch,
  RecognitionCrop,
  RecognitionLine
} from '../types/ocr-engine';
import { MeasureQuadCrop } from './quad-geometry';

type SortableCrop = { crop: RecognitionCrop; aspect_ratio: number };

// The crop's sides come from its quad (spec 0002 §6.4 step 1). A vertical
// line is rotated before recognition, so its sides swap.
function CreateSortableCrop(
  line: RecognitionLine,
  target_height_px: number
): SortableCrop {
  const { quad_px, is_vertical } = line;
  const quad_crop = MeasureQuadCrop(quad_px);
  const crop_width_px = is_vertical ? quad_crop.height_px : quad_crop.width_px;
  const crop_height_px = is_vertical ? quad_crop.width_px : quad_crop.height_px;
  const resized_width_px = Math.max(
    1,
    Math.ceil((target_height_px * crop_width_px) / crop_height_px)
  );

  return {
    crop: { ...line, resized_width_px },
    aspect_ratio: crop_width_px / crop_height_px
  };
}

/**
 * Plans the recognition batches (spec 0002 §6.4 steps 1–4): crops sorted by
 * aspect ratio, RECOGNITION_BATCH_SIZE per batch, each batch as wide as its
 * widest resized crop and never narrower than the model's input width.
 */
export function PlanRecognitionBatches(
  lines: readonly RecognitionLine[],
  image_shape: readonly [number, number, number]
): RecognitionBatch[] {
  const [, target_height_px, model_width_px] = image_shape;
  const sorted_crops = lines
    .map(line => CreateSortableCrop(line, target_height_px))
    .toSorted((left, right) => left.aspect_ratio - right.aspect_ratio)
    .map(sortable_crop => sortable_crop.crop);
  const batches: RecognitionBatch[] = [];

  for (
    let batch_start = 0;
    batch_start < sorted_crops.length;
    batch_start += RECOGNITION_BATCH_SIZE
  ) {
    const crops = sorted_crops.slice(
      batch_start,
      batch_start + RECOGNITION_BATCH_SIZE
    );
    const width_px = Math.max(
      model_width_px,
      ...crops.map(crop => crop.resized_width_px)
    );

    batches.push({ crops, width_px });
  }

  return batches;
}
