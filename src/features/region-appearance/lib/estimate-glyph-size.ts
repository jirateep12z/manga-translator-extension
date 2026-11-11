import { CalculateMedian } from '@/lib/median';
import {
  GLYPH_MIN_PX,
  GLYPH_RUN_MIN_PX,
  INK_MIN_DISTANCE
} from '../constants/region-appearance';
import type {
  GlyphEstimate,
  GlyphHint,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';
import {
  EstimateBackgroundColor,
  ListInteriorPixels
} from './estimate-background';
import { MeasureDistanceAt } from './pixel-sampling';

function ReadShorterSide(box: PixelBox): number {
  return Math.min(box.right_px - box.left_px, box.bottom_px - box.top_px);
}

// Keeps a glyph size between GLYPH_MIN_PX and the box's shorter side
// (spec 0003 §6.2).
export function ClampGlyphSize(glyph_size_px: number, box: PixelBox): number {
  return Math.min(
    Math.max(glyph_size_px, GLYPH_MIN_PX),
    Math.max(GLYPH_MIN_PX, ReadShorterSide(box))
  );
}

// A hint is in page pixels; the estimate is in decoded pixels.
export function ResolveHintGlyph(
  hint: GlyphHint,
  scale: number,
  box: PixelBox
): GlyphEstimate {
  return {
    glyph_size_px: ClampGlyphSize(hint.glyph_size_px * scale, box),
    is_vertical: hint.is_vertical
  };
}

// The lengths of the runs of marked entries, keeping runs of at least
// GLYPH_RUN_MIN_PX.
function ListRunLengths(marks: Uint8Array): number[] {
  const run_lengths: number[] = [];
  let run_length = 0;

  for (const mark of marks) {
    if (mark === 1) {
      run_length++;
      continue;
    }

    if (run_length >= GLYPH_RUN_MIN_PX) run_lengths.push(run_length);

    run_length = 0;
  }

  if (run_length >= GLYPH_RUN_MIN_PX) run_lengths.push(run_length);

  return run_lengths;
}

// Lines of the source text that hold a character other than whitespace.
function CountTextLines(source_text: string): number {
  return source_text.split('\n').filter(line => line.trim() !== '').length;
}

// The glyph size and orientation from the ink in the box, for readings
// without a glyph hint (spec 0003 §6.2).
export function EstimateGlyphFromInk(input: {
  image: RgbaImage;
  box: PixelBox;
  source_text: string;
}): GlyphEstimate {
  const { image, box, source_text } = input;
  const background_color = EstimateBackgroundColor(
    image,
    ListInteriorPixels(image, box)
  );
  const box_width_px = box.right_px - box.left_px;
  const box_height_px = box.bottom_px - box.top_px;
  const row_marks = new Uint8Array(box_height_px);
  const column_marks = new Uint8Array(box_width_px);

  for (let y_px = box.top_px; y_px < box.bottom_px; y_px++) {
    for (let x_px = box.left_px; x_px < box.right_px; x_px++) {
      const distance = MeasureDistanceAt(
        image,
        y_px * image.width_px + x_px,
        background_color
      );

      if (distance >= INK_MIN_DISTANCE) {
        row_marks[y_px - box.top_px] = 1;
        column_marks[x_px - box.left_px] = 1;
      }
    }
  }

  const row_runs = ListRunLengths(row_marks);
  const column_runs = ListRunLengths(column_marks);
  const line_count = CountTextLines(source_text);
  const is_horizontal =
    line_count >= 2
      ? Math.abs(row_runs.length - line_count) <=
        Math.abs(column_runs.length - line_count)
      : box_width_px >= box_height_px;
  const glyph_runs = is_horizontal ? row_runs : column_runs;
  const glyph_size_px =
    glyph_runs.length === 0
      ? ReadShorterSide(box)
      : CalculateMedian(glyph_runs);

  return {
    glyph_size_px: ClampGlyphSize(glyph_size_px, box),
    is_vertical: !is_horizontal
  };
}
