import type {
  BboxPx,
  RegionAppearance,
  RegionFrame,
  TextRegion
} from '@/services/database';
import {
  COVER_PAD_MIN_PX,
  COVER_PAD_RATIO,
  RING_INNER_PAD_MIN_PX,
  RING_INNER_PAD_RATIO,
  RING_WIDTH_MIN_PX,
  RING_WIDTH_RATIO
} from '../constants/region-appearance';
import type {
  GlyphEstimate,
  ImageSize,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';
import { ClassifyLettering } from './classify-lettering';
import {
  ClassifyBackdrop,
  EstimateBackgroundColor,
  ListInteriorPixels,
  ListRingPixels
} from './estimate-background';
import { EstimateInkColor } from './estimate-ink-color';
import { FindTextBoxCandidates } from './find-text-box-candidates';
import { ComputeSearchWindow, FloodPaper, ListSeedPixels } from './flood-paper';
import { ComputePaddedBox, GrowCoverBox } from './grow-cover-box';
import { ExpandPixelBox, ToPageBox } from './pixel-box';

// One region's appearance from the decoded page (spec 0003 §6.3–§6.8). Boxes
// come in decoded pixels and go out in page pixels.
export function AnalyzeRegion(input: {
  image: RgbaImage;
  scale: number;
  page_size: ImageSize;
  reference_height_px: number;
  region: TextRegion;
  box: PixelBox;
  glyph: GlyphEstimate;
  other_boxes: readonly PixelBox[];
  other_glyph_sizes_px: readonly number[];
}): RegionAppearance {
  const {
    image,
    scale,
    page_size,
    reference_height_px,
    region,
    box,
    glyph,
    other_boxes
  } = input;
  const glyph_size_px = glyph.glyph_size_px;
  const inner_pad_px = Math.max(
    RING_INNER_PAD_MIN_PX,
    Math.round(RING_INNER_PAD_RATIO * glyph_size_px)
  );
  const ring_width_px = Math.max(
    RING_WIDTH_MIN_PX,
    Math.round(RING_WIDTH_RATIO * glyph_size_px)
  );
  const interior_pixels = ListInteriorPixels(image, box);
  const ring_pixels = ListRingPixels(image, box, inner_pad_px, ring_width_px);
  const background_color = EstimateBackgroundColor(image, [
    ...interior_pixels,
    ...ring_pixels
  ]);
  const backdrop = ClassifyBackdrop({
    image,
    background_color,
    interior_pixels,
    ring_pixels
  });
  const ink_color = EstimateInkColor(image, box, background_color);
  const window = ComputeSearchWindow(box, image, reference_height_px);
  const fill =
    backdrop === 'flat' && window
      ? FloodPaper({
          image,
          window,
          seed_pixels: ListSeedPixels(image, box, ring_pixels),
          background_color
        })
      : null;
  const frame: RegionFrame =
    fill && fill.filled_count > 0 && !fill.is_reaching_edge ? 'closed' : 'open';
  const pad_px = Math.max(
    COVER_PAD_MIN_PX,
    Math.round(COVER_PAD_RATIO * glyph_size_px)
  );
  const padded_box = ComputePaddedBox(box, pad_px, other_boxes, image);
  const cover_box =
    backdrop === 'flat'
      ? GrowCoverBox({
          image,
          box,
          padded_box,
          background_color,
          blocked_boxes: other_boxes.map(other_box =>
            ExpandPixelBox(other_box, inner_pad_px, image)
          )
        })
      : padded_box;
  const lettering = ClassifyLettering({
    glyph_size_px,
    other_glyph_sizes_px: input.other_glyph_sizes_px,
    frame,
    source_text: region.source_text,
    box,
    image_width_px: image.width_px,
    reference_height_px
  });
  const candidate_boxes_px = FindTextBoxCandidates({
    image,
    box,
    padded_box,
    window,
    fill,
    frame,
    backdrop,
    background_color,
    glyph,
    inner_pad_px,
    other_boxes
  })
    .map(candidate => ToPageBox(candidate, scale, page_size))
    .filter((candidate): candidate is BboxPx => candidate !== null);

  return {
    background_color,
    ink_color,
    frame,
    backdrop,
    lettering,
    glyph_size_px: Math.max(1, Math.round(glyph_size_px / scale)),
    is_vertical: glyph.is_vertical,
    cover_box_px: ToPageBox(cover_box, scale, page_size) ?? {
      ...region.bbox_px
    },
    text_box_candidates_px:
      candidate_boxes_px.length > 0
        ? candidate_boxes_px
        : [{ ...region.bbox_px }]
  };
}
