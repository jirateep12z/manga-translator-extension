import type { OcrLine, OcrRecognizer } from '@/features/ocr-engine';
import type { GlyphHint } from '@/features/region-appearance';
import type { ReadingDirection } from '@/features/settings';
import type { SourceLanguage, TextRegion } from '@/services/database';
import { UnionBoxes } from './box-geometry';
import { CreateGlyphHint } from './create-glyph-hint';
import { DetectSourceLanguage } from './detect-source-language';
import { FilterOcrLines } from './filter-ocr-lines';
import { GroupOcrLines } from './group-ocr-lines';
import { MergeNestedGroups } from './merge-nested-groups';
import { OrderRegionLines } from './order-region-lines';
import { OrderRegions, ResolveReadingDirection } from './order-regions';

export type OcrRegionAssembly = {
  regions: TextRegion[];
  source_language: SourceLanguage;
  kept_line_count: number;
  glyph_hints: GlyphHint[]; // one for each region, in the same order
};

type UnnumberedRegion = Omit<TextRegion, 'region_id'> & {
  lines: readonly OcrLine[];
};

const REGION_ID_PREFIX = 'r';
const REGION_LINE_SEPARATOR = '\n';

// The lines come in reading order (spec 0002 Sections 7.3 and 22).
function CreateRegion(ordered_lines: readonly OcrLine[]): UnnumberedRegion {
  return {
    bbox_px: UnionBoxes(ordered_lines.map(line => line.bbox_px)),
    kind: 'speech',
    source_text: ordered_lines
      .map(line => line.text)
      .join(REGION_LINE_SEPARATOR),
    lines: ordered_lines
  };
}

/**
 * Turns the engine's lines into speech regions in reading order (spec 0002
 * §7): filter, detect the language, group, order, and number them r1, r2, ….
 */
export function AssembleOcrRegions(input: {
  lines: OcrLine[];
  reading_direction: ReadingDirection;
  recognizer: OcrRecognizer;
}): OcrRegionAssembly {
  const kept_lines = FilterOcrLines(input.lines);
  const source_language = DetectSourceLanguage(kept_lines, input.recognizer);
  const direction = ResolveReadingDirection(
    input.reading_direction,
    source_language,
    kept_lines
  );
  const numbered_regions = OrderRegions(
    MergeNestedGroups(GroupOcrLines(kept_lines).map(OrderRegionLines)).map(
      CreateRegion
    ),
    direction
  ).map((region, region_index) => ({
    ...region,
    region_id: `${REGION_ID_PREFIX}${region_index + 1}`
  }));

  return {
    regions: numbered_regions.map(region => ({
      region_id: region.region_id,
      bbox_px: region.bbox_px,
      kind: region.kind,
      source_text: region.source_text
    })),
    source_language,
    kept_line_count: kept_lines.length,
    glyph_hints: numbered_regions.map(region =>
      CreateGlyphHint(region.region_id, region.lines)
    )
  };
}
