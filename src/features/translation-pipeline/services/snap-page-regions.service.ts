import { ToErrorCode } from '@/lib/app-error';
import type { BboxPx, TextRegion } from '@/services/database';
import { SnapRegionBoxes } from '../lib/snap-region-boxes';
import { ReadGrayImage } from './image-codec.service';

function ScaleBbox(bbox_px: BboxPx, scale: number): BboxPx {
  return {
    x_px: Math.round(bbox_px.x_px * scale),
    y_px: Math.round(bbox_px.y_px * scale),
    width_px: Math.round(bbox_px.width_px * scale),
    height_px: Math.round(bbox_px.height_px * scale)
  };
}

/**
 * Moves each region box onto its text in the page image. Snapping only
 * improves placement, so a page that cannot be decoded keeps the model's boxes.
 */
export async function SnapPageRegions(
  image_blob: Blob,
  regions: TextRegion[]
): Promise<TextRegion[]> {
  if (regions.length === 0) return regions;

  try {
    const { image, scale } = await ReadGrayImage(image_blob);
    const scaled_inputs = regions.map(region => ({
      bbox_px: ScaleBbox(region.bbox_px, scale),
      source_text: region.source_text
    }));
    const snapped_boxes = SnapRegionBoxes(image, scaled_inputs);

    return regions.map((region, index) =>
      // An unchanged box keeps its exact original pixels.
      snapped_boxes[index] === scaled_inputs[index].bbox_px
        ? region
        : { ...region, bbox_px: ScaleBbox(snapped_boxes[index], 1 / scale) }
    );
  } catch (error) {
    const error_code = ToErrorCode(error);

    console.warn(`[background] snap-region-boxes failed: ${error_code}`, {
      region_count: regions.length,
      outcome: 'failed',
      error_code
    });

    return regions;
  }
}
