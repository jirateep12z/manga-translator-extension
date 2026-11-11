import type { RegionAppearance, TextRegion } from '@/services/database';
import { MAX_PAGE_ANALYSIS_MS } from '../constants/region-appearance';
import { AnalyzeRegion } from '../lib/analyze-region';
import {
  EstimateGlyphFromInk,
  ResolveHintGlyph
} from '../lib/estimate-glyph-size';
import {
  ComputeReferenceHeight,
  IsEmptyPixelBox,
  ToPixelBox
} from '../lib/pixel-box';
import type {
  GlyphEstimate,
  GlyphHint,
  PageAppearanceResult,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';

type PageAnalysisDependencies = {
  ReadNowMs: () => number;
  YieldToEventLoop: () => Promise<void>;
};

const DEFAULT_DEPENDENCIES: PageAnalysisDependencies = {
  ReadNowMs: () => performance.now(),
  YieldToEventLoop: () => new Promise<void>(resolve => setTimeout(resolve, 0))
};

// A region with a non-empty box in decoded pixels, and its glyph estimate.
type MeasuredRegion = {
  region_index: number;
  box: PixelBox;
  glyph: GlyphEstimate;
};

function IndexGlyphHints(
  glyph_hints: readonly GlyphHint[]
): Map<string, GlyphHint> {
  const hints_by_region_id = new Map<string, GlyphHint>();

  for (const hint of glyph_hints) {
    if (!hints_by_region_id.has(hint.region_id)) {
      hints_by_region_id.set(hint.region_id, hint);
    }
  }

  return hints_by_region_id;
}

// Analyzes each region of a decoded page within the page budget, yielding
// after each region so that a canceled job stops within one region
// (spec 0003 §6.9). The input regions are not changed.
export async function AnalyzePageAppearance(
  input: {
    image: RgbaImage;
    scale: number;
    page_width_px: number;
    page_height_px: number;
    regions: TextRegion[];
    glyph_hints: GlyphHint[];
    signal: AbortSignal;
  },
  dependencies: PageAnalysisDependencies = DEFAULT_DEPENDENCIES
): Promise<PageAppearanceResult> {
  const { image, scale, regions, signal } = input;
  const { ReadNowMs, YieldToEventLoop } = dependencies;

  signal.throwIfAborted();

  const started_at_ms = ReadNowMs();
  const reference_height_px = ComputeReferenceHeight(image);
  const hints_by_region_id = IndexGlyphHints(input.glyph_hints);
  const measured_regions: MeasuredRegion[] = [];

  for (const [region_index, region] of regions.entries()) {
    const box = ToPixelBox(region.bbox_px, scale, image);

    if (IsEmptyPixelBox(box)) continue;

    const hint = hints_by_region_id.get(region.region_id);
    const glyph = hint
      ? ResolveHintGlyph(hint, scale, box)
      : EstimateGlyphFromInk({ image, box, source_text: region.source_text });

    measured_regions.push({ region_index, box, glyph });
    await YieldToEventLoop();
    signal.throwIfAborted();
  }

  const appearances = new Map<number, RegionAppearance>();
  let timed_out_region_count = 0;

  for (const measured_region of measured_regions) {
    if (ReadNowMs() - started_at_ms >= MAX_PAGE_ANALYSIS_MS) {
      timed_out_region_count = measured_regions.length - appearances.size;
      break;
    }

    const other_regions = measured_regions.filter(
      other_region => other_region !== measured_region
    );

    appearances.set(
      measured_region.region_index,
      AnalyzeRegion({
        image,
        scale,
        page_size: {
          width_px: input.page_width_px,
          height_px: input.page_height_px
        },
        reference_height_px,
        region: regions[measured_region.region_index],
        box: measured_region.box,
        glyph: measured_region.glyph,
        other_boxes: other_regions.map(other_region => other_region.box),
        other_glyph_sizes_px: other_regions.map(
          other_region => other_region.glyph.glyph_size_px
        )
      })
    );
    await YieldToEventLoop();
    signal.throwIfAborted();
  }

  const analysis_ms = ReadNowMs() - started_at_ms;

  return {
    regions: regions.map((region, region_index) => {
      const { appearance: _previous_appearance, ...region_fields } = region;
      const appearance = appearances.get(region_index);

      return appearance ? { ...region_fields, appearance } : region_fields;
    }),
    analyzed_region_count: appearances.size,
    skipped_region_count: regions.length - measured_regions.length,
    timed_out_region_count,
    analysis_ms
  };
}
