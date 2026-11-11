import type { OcrLine } from '@/features/ocr-engine';
import type { GlyphHint } from '@/features/region-appearance';
import { CalculateMedian } from '@/lib/median';

// The glyph size of a region: the median thickness of its lines, which share
// one orientation (spec 0003 §6.2). Every region has at least one line.
export function CreateGlyphHint(
  region_id: string,
  lines: readonly OcrLine[]
): GlyphHint {
  const is_vertical = lines[0].is_vertical;

  return {
    region_id,
    glyph_size_px: CalculateMedian(
      lines.map(line =>
        is_vertical ? line.bbox_px.width_px : line.bbox_px.height_px
      )
    ),
    is_vertical
  };
}
