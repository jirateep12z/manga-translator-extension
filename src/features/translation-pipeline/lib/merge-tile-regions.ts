import { NormalizeText } from '@/lib/normalize-text';
import type { BboxPx, SourceLanguage, TextRegion } from '@/services/database';
import { DEDUP_IOU_THRESHOLD, NORMALIZED_BOX_MAX } from '../constants/pipeline';
import type {
  ImageTile,
  NormalizedBox,
  NormalizedRegion
} from '../types/pipeline';

type TileReading = { tile: ImageTile; regions: NormalizedRegion[] };

export function MapNormalizedBox(bbox: NormalizedBox, tile: ImageTile): BboxPx {
  const MapX = (value: number) =>
    Math.round(
      tile.source_x_px + (value / NORMALIZED_BOX_MAX) * tile.source_width_px
    );
  const MapY = (value: number) =>
    Math.round(
      tile.source_y_px + (value / NORMALIZED_BOX_MAX) * tile.source_height_px
    );
  const x_min_px = MapX(bbox[0]);
  const y_min_px = MapY(bbox[1]);

  return {
    x_px: x_min_px,
    y_px: y_min_px,
    width_px: MapX(bbox[2]) - x_min_px,
    height_px: MapY(bbox[3]) - y_min_px
  };
}

function ComputeIntersectionArea(left: BboxPx, right: BboxPx): number {
  const overlap_width =
    Math.min(left.x_px + left.width_px, right.x_px + right.width_px) -
    Math.max(left.x_px, right.x_px);
  const overlap_height =
    Math.min(left.y_px + left.height_px, right.y_px + right.height_px) -
    Math.max(left.y_px, right.y_px);

  return Math.max(0, overlap_width) * Math.max(0, overlap_height);
}

export function ComputeIntersectionOverUnion(
  left: BboxPx,
  right: BboxPx
): number {
  const intersection_area = ComputeIntersectionArea(left, right);
  const union_area =
    left.width_px * left.height_px +
    right.width_px * right.height_px -
    intersection_area;

  return union_area > 0 ? intersection_area / union_area : 0;
}

type MappedRegion = Omit<TextRegion, 'region_id'> & { normalized_text: string };

function IsOverlapDuplicate(
  region: MappedRegion,
  previous_tile_regions: MappedRegion[]
): boolean {
  return previous_tile_regions.some(
    previous =>
      ComputeIntersectionOverUnion(region.bbox_px, previous.bbox_px) >
        DEDUP_IOU_THRESHOLD ||
      (region.normalized_text === previous.normalized_text &&
        ComputeIntersectionArea(region.bbox_px, previous.bbox_px) > 0)
  );
}

export function MergeTileRegions(tile_readings: TileReading[]): TextRegion[] {
  const kept_regions: MappedRegion[] = [];
  let previous_tile_regions: MappedRegion[] = [];

  for (const [reading_index, reading] of tile_readings.entries()) {
    const mapped_regions = reading.regions.map(region => ({
      bbox_px: MapNormalizedBox(region.bbox, reading.tile),
      kind: region.kind,
      source_text: region.source_text,
      normalized_text: NormalizeText(region.source_text)
    }));
    const tile_kept_regions = mapped_regions.filter(
      region =>
        reading_index === 0 ||
        !IsOverlapDuplicate(region, previous_tile_regions)
    );

    kept_regions.push(...tile_kept_regions);
    previous_tile_regions = tile_kept_regions;
  }

  return kept_regions.map((region, index) => ({
    region_id: `r${index + 1}`,
    bbox_px: region.bbox_px,
    kind: region.kind,
    source_text: region.source_text
  }));
}

export function PickSourceLanguage(
  languages: SourceLanguage[]
): SourceLanguage {
  const language_counts = new Map<SourceLanguage, number>();

  for (const language of languages) {
    if (language === 'other') continue;
    language_counts.set(language, (language_counts.get(language) ?? 0) + 1);
  }

  let picked_language: SourceLanguage = 'other';
  let picked_count = 0;

  for (const [language, count] of language_counts) {
    if (count > picked_count) {
      picked_language = language;
      picked_count = count;
    }
  }

  return picked_language;
}
