import type { BboxPx } from '@/services/database';
import { AssignBlocks } from './region-snapping/block-assignment';
import {
  PickScoredTextArea,
  PickTextArea
} from './region-snapping/block-scoring';
import {
  FindClosedTextAreasNear,
  IsInsideClosedArea
} from './region-snapping/closed-areas';
import {
  FillEnclosedPaper,
  FillInsideArea,
  PadInsideArea
} from './region-snapping/fit-inside-area';
import {
  IntersectRects,
  RectArea,
  ToBbox,
  ToRect,
  type Rect
} from './region-snapping/geometry';
import {
  FindOpenTextAreasNear,
  OPEN_TEXT_REACH_RATIO
} from './region-snapping/open-text';
import {
  SEARCH_EXPAND_RATIOS,
  WIDEST_SEARCH_EXPAND_RATIO
} from './region-snapping/search-window';
import { AddStackedLines } from './region-snapping/stacked-lines';
import type {
  GrayImage,
  SnapRegionInput,
  TextArea
} from './region-snapping/types';

export type { GrayImage, SnapRegionInput } from './region-snapping/types';

// Vision models place text boxes loosely, so each box is moved onto the text
// glyphs found next to it: first inside closed bubbles and caption frames,
// then, for the regions left, among free lettering on paper.

type SnapContext = {
  model_rects: Rect[];
  character_counts: number[];
  snapped_rects: Map<number, Rect>;
};

function IsUsableBox(image: GrayImage, box: BboxPx): boolean {
  return (
    box.width_px > 0 &&
    box.height_px > 0 &&
    box.x_px < image.width_px &&
    box.y_px < image.height_px &&
    box.x_px + box.width_px > 0 &&
    box.y_px + box.height_px > 0
  );
}

function CountSourceCharacters(source_text: string): number {
  return Array.from(source_text.replace(/\s/g, '')).length;
}

function FindClosedRegionArea(
  image: GrayImage,
  model_rect: Rect,
  character_count: number,
  known_areas: Map<string, TextArea>
): TextArea | null {
  for (const expand_ratio of SEARCH_EXPAND_RATIOS) {
    const area = PickTextArea(
      model_rect,
      FindClosedTextAreasNear(image, model_rect, expand_ratio, known_areas),
      character_count,
      expand_ratio
    );

    if (area) return area;
  }

  return null;
}

function IsClaimed(area: TextArea, claimed_rects: Rect[]): boolean {
  return claimed_rects.some(
    claimed_rect =>
      RectArea(IntersectRects(claimed_rect, area.blocks[0].rect)) > 0
  );
}

/** Free lettering that no region has already been snapped onto. */
function PickOpenRegionArea(
  model_rect: Rect,
  character_count: number,
  open_areas: TextArea[],
  claimed_rects: Rect[]
): { area: TextArea; score: number } | null {
  return PickScoredTextArea(
    model_rect,
    open_areas.filter(area => !IsClaimed(area, claimed_rects)),
    character_count,
    OPEN_TEXT_REACH_RATIO
  );
}

/**
 * Snaps the remaining regions onto free lettering one at a time, the surest
 * match first, so no two regions share lettering. A region whose window holds
 * only part of another region's text, or whose box sits between two texts, is
 * decided after its neighbors have taken theirs.
 */
function SnapFreeTextRegions(
  image: GrayImage,
  region_indexes: number[],
  context: SnapContext
): void {
  const open_areas_by_region = new Map(
    region_indexes.map(region_index => [
      region_index,
      FindOpenTextAreasNear(
        image,
        context.model_rects[region_index],
        context.character_counts[region_index]
      )
    ])
  );
  const pending_region_indexes = new Set(region_indexes);

  while (pending_region_indexes.size > 0) {
    const claimed_rects = [...context.snapped_rects.values()];
    let best_pick: {
      region_index: number;
      area: TextArea;
      score: number;
    } | null = null;

    for (const region_index of pending_region_indexes) {
      const pick = PickOpenRegionArea(
        context.model_rects[region_index],
        context.character_counts[region_index],
        open_areas_by_region.get(region_index) ?? [],
        claimed_rects
      );

      if (pick && (!best_pick || pick.score > best_pick.score)) {
        best_pick = { region_index, ...pick };
      }
    }

    if (!best_pick) return;

    const { region_index: picked_region_index, area: picked_area } = best_pick;

    pending_region_indexes.delete(picked_region_index);

    const text_rect = AssignBlocks(
      picked_area,
      [picked_region_index],
      context.model_rects,
      context.character_counts,
      OPEN_TEXT_REACH_RATIO
    ).get(picked_region_index);

    if (text_rect) {
      const unclaimed_lines = (
        open_areas_by_region.get(picked_region_index) ?? []
      ).filter(area => area !== picked_area && !IsClaimed(area, claimed_rects));
      const lettering_rect = AddStackedLines(text_rect, unclaimed_lines, {
        model_rect: context.model_rects[picked_region_index],
        other_model_rects: context.model_rects.filter(
          (_model_rect, region_index) => region_index !== picked_region_index
        ),
        glyph_height_px: picked_area.glyph_height_px
      });

      context.snapped_rects.set(
        picked_region_index,
        FillEnclosedPaper(image, lettering_rect, picked_area)
      );
    }
  }
}

function FindAreaAroundBox(
  areas: TextArea[],
  model_rect: Rect
): TextArea | null {
  const center_x_px = Math.floor(
    (model_rect.left_px + model_rect.right_px) / 2
  );
  const center_y_px = Math.floor(
    (model_rect.top_px + model_rect.bottom_px) / 2
  );

  return (
    areas.find(area => IsInsideClosedArea(area, center_x_px, center_y_px)) ??
    null
  );
}

/** Snaps each group of regions that found the same closed area onto its blocks. */
function SnapRegionsInClosedAreas(
  region_indexes: number[],
  FindArea: (region_index: number) => TextArea | null,
  context: SnapContext
): void {
  const areas = new Map<string, TextArea>();
  const regions_by_area = new Map<string, number[]>();
  const AddToArea = (area: TextArea, region_index: number) => {
    areas.set(area.area_key, area);
    regions_by_area.set(area.area_key, [
      ...(regions_by_area.get(area.area_key) ?? []),
      region_index
    ]);
  };
  const unplaced_region_indexes: number[] = [];

  for (const region_index of region_indexes) {
    const area = FindArea(region_index);

    if (area) AddToArea(area, region_index);
    else unplaced_region_indexes.push(region_index);
  }

  // A small box's windows can miss a tall frame that a neighbor's box closed.
  const found_areas = [...areas.values()];
  const joined_region_indexes = new Set<number>();

  for (const region_index of unplaced_region_indexes) {
    const area = FindAreaAroundBox(
      found_areas,
      context.model_rects[region_index]
    );

    if (!area) continue;

    AddToArea(area, region_index);
    joined_region_indexes.add(region_index);
  }

  for (const [area_key, area_region_indexes] of regions_by_area) {
    const area = areas.get(area_key) as TextArea;
    const text_rects = AssignBlocks(
      area,
      area_region_indexes,
      context.model_rects,
      context.character_counts,
      WIDEST_SEARCH_EXPAND_RATIO
    );
    // A region that joined the area counts only once text was found for it.
    const caption_count = area_region_indexes.filter(
      region_index =>
        !joined_region_indexes.has(region_index) || text_rects.has(region_index)
    ).length;
    const is_single_caption_area = caption_count === 1;

    for (const [region_index, text_rect] of text_rects) {
      context.snapped_rects.set(
        region_index,
        is_single_caption_area
          ? FillInsideArea(text_rect, area)
          : PadInsideArea(text_rect, area)
      );
    }
  }
}

/**
 * Returns one box per region: moved onto the region's text, or the model's
 * box when no text is found for it.
 */
export function SnapRegionBoxes(
  image: GrayImage,
  regions: SnapRegionInput[]
): BboxPx[] {
  const context: SnapContext = {
    model_rects: regions.map(region => ToRect(region.bbox_px)),
    character_counts: regions.map(region =>
      CountSourceCharacters(region.source_text)
    ),
    snapped_rects: new Map()
  };
  const usable_region_indexes = regions
    .map((region, region_index) => ({ region, region_index }))
    .filter(({ region }) => IsUsableBox(image, region.bbox_px))
    .map(({ region_index }) => region_index);
  const known_areas = new Map<string, TextArea>();

  SnapRegionsInClosedAreas(
    usable_region_indexes,
    region_index =>
      FindClosedRegionArea(
        image,
        context.model_rects[region_index],
        context.character_counts[region_index],
        known_areas
      ),
    context
  );

  SnapFreeTextRegions(
    image,
    usable_region_indexes.filter(
      region_index => !context.snapped_rects.has(region_index)
    ),
    context
  );

  return regions.map((region, region_index) => {
    const snapped_rect = context.snapped_rects.get(region_index);

    return snapped_rect ? ToBbox(snapped_rect) : region.bbox_px;
  });
}
