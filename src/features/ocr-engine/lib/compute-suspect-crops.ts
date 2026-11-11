import type { BboxPx } from '@/services/database';
import type { DetectionTile } from '../types/ocr-engine';

type CropEdges = {
  left_px: number;
  top_px: number;
  right_px: number;
  bottom_px: number;
};

function GrowBox(
  box: BboxPx,
  margin_px: number,
  page_width_px: number,
  page_height_px: number
): CropEdges {
  return {
    left_px: Math.max(0, Math.floor(box.x_px - margin_px)),
    top_px: Math.max(0, Math.floor(box.y_px - margin_px)),
    right_px: Math.min(
      page_width_px,
      Math.ceil(box.x_px + box.width_px + margin_px)
    ),
    bottom_px: Math.min(
      page_height_px,
      Math.ceil(box.y_px + box.height_px + margin_px)
    )
  };
}

// Crops whose edges only touch do not overlap.
function IsOverlapping(first: CropEdges, second: CropEdges): boolean {
  return (
    Math.min(first.right_px, second.right_px) >
      Math.max(first.left_px, second.left_px) &&
    Math.min(first.bottom_px, second.bottom_px) >
      Math.max(first.top_px, second.top_px)
  );
}

function UniteCrops(first: CropEdges, second: CropEdges): CropEdges {
  return {
    left_px: Math.min(first.left_px, second.left_px),
    top_px: Math.min(first.top_px, second.top_px),
    right_px: Math.max(first.right_px, second.right_px),
    bottom_px: Math.max(first.bottom_px, second.bottom_px)
  };
}

// The merged crops never overlap one another: each new crop absorbs every
// merged crop that it overlaps, checking again after each growth, before it
// joins them.
function MergeOverlappingCrops(crops: readonly CropEdges[]): CropEdges[] {
  const merged_crops: CropEdges[] = [];

  for (const crop of crops) {
    let growing_crop = crop;
    let overlap_index = merged_crops.findIndex(merged_crop =>
      IsOverlapping(growing_crop, merged_crop)
    );

    while (overlap_index !== -1) {
      growing_crop = UniteCrops(growing_crop, merged_crops[overlap_index]);
      merged_crops.splice(overlap_index, 1);
      overlap_index = merged_crops.findIndex(merged_crop =>
        IsOverlapping(growing_crop, merged_crop)
      );
    }

    merged_crops.push(growing_crop);
  }

  return merged_crops;
}

function ToDetectionTile(crop: CropEdges): DetectionTile {
  return {
    source_x_px: crop.left_px,
    source_y_px: crop.top_px,
    source_width_px: crop.right_px - crop.left_px,
    source_height_px: crop.bottom_px - crop.top_px
  };
}

/**
 * Grows each suspect box into a crop for the second pass (spec 0002 Section
 * 24, design step 4): `margin_px` on every side, rounded outward to whole
 * pixels and clipped to the page. Crops that overlap with a positive area
 * merge into their bounding rectangle until none overlap. The crops come out
 * from top to bottom, then from left to right.
 */
export function ComputeSuspectCrops(
  suspect_boxes: readonly BboxPx[],
  margin_px: number,
  page_width_px: number,
  page_height_px: number
): DetectionTile[] {
  const crops = suspect_boxes.map(box =>
    GrowBox(box, margin_px, page_width_px, page_height_px)
  );

  return MergeOverlappingCrops(crops)
    .map(ToDetectionTile)
    .toSorted(
      (left, right) =>
        left.source_y_px - right.source_y_px ||
        left.source_x_px - right.source_x_px
    );
}
