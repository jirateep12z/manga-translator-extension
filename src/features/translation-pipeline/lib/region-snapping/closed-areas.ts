import {
  CreateRectKey,
  IntersectRects,
  NEIGHBOR_OFFSETS_4,
  NEIGHBOR_OFFSETS_8,
  RectArea,
  ToLocalIndex,
  UniteRects,
  type Rect
} from './geometry';
import {
  ComputeSearchWindow,
  IsNearPass,
  WHITE_MIN_GRAY
} from './search-window';
import { BuildTextArea, IsGlyphShaped } from './text-blocks';
import type { GrayImage, TextArea } from './types';

// Manga text mostly sits in white bubbles and caption frames closed by a dark
// outline; the glyphs are the ink enclosed by such a white area.
const SEED_GRID_SIZE = 7;
const WIDE_SEED_GRID_SIZE = 15;
const MIN_GLYPH_AREA_PX = 4;
const MAX_GLYPH_SIDE_RATIO_OF_AREA = 0.5;
const GLYPH_LABEL = 0;

export const WHITE_LABEL = 1;
const OUTSIDE_LABEL = 2;

/** True when the point lies on the area's paper or on the ink it encloses. */
export function IsInsideClosedArea(
  area: TextArea,
  x_px: number,
  y_px: number
): boolean {
  const { bounds, pixel_labels } = area;
  const is_inside_bounds =
    x_px >= bounds.left_px &&
    x_px < bounds.right_px &&
    y_px >= bounds.top_px &&
    y_px < bounds.bottom_px;

  if (!pixel_labels || !is_inside_bounds) return false;

  return pixel_labels[ToLocalIndex(bounds, x_px, y_px)] !== OUTSIDE_LABEL;
}

/**
 * Fills the white area around a seed inside the window. Returns null when the
 * area reaches the window edge, because then it is not a closed bubble.
 */
function FillClosedWhiteArea(
  image: GrayImage,
  window: Rect,
  seed_x_px: number,
  seed_y_px: number,
  visited: Uint8Array
): { bounds: Rect; members: Set<number> } | null {
  const window_width_px = window.right_px - window.left_px;
  const members = new Set<number>();
  const stack = [seed_y_px * image.width_px + seed_x_px];
  let bounds: Rect = {
    left_px: seed_x_px,
    top_px: seed_y_px,
    right_px: seed_x_px + 1,
    bottom_px: seed_y_px + 1
  };
  let is_touching_window = false;

  visited[
    (seed_y_px - window.top_px) * window_width_px + seed_x_px - window.left_px
  ] = 1;

  while (stack.length > 0) {
    const pixel_index = stack.pop() as number;
    const x_px = pixel_index % image.width_px;
    const y_px = (pixel_index - x_px) / image.width_px;

    members.add(pixel_index);
    bounds = UniteRects(bounds, {
      left_px: x_px,
      top_px: y_px,
      right_px: x_px + 1,
      bottom_px: y_px + 1
    });

    for (const [offset_x, offset_y] of NEIGHBOR_OFFSETS_4) {
      const next_x_px = x_px + offset_x;
      const next_y_px = y_px + offset_y;
      const is_outside_window =
        next_x_px < window.left_px ||
        next_x_px >= window.right_px ||
        next_y_px < window.top_px ||
        next_y_px >= window.bottom_px;

      if (is_outside_window) {
        is_touching_window = true;
        continue;
      }

      const visited_index =
        (next_y_px - window.top_px) * window_width_px +
        next_x_px -
        window.left_px;
      const next_index = next_y_px * image.width_px + next_x_px;

      if (visited[visited_index] === 1) continue;
      if (image.pixels[next_index] < WHITE_MIN_GRAY) continue;

      visited[visited_index] = 1;
      stack.push(next_index);
    }
  }

  return is_touching_window ? null : { bounds, members };
}

function MarkOutside(
  labels: Uint8Array,
  width_px: number,
  height_px: number
): void {
  const stack: number[] = [];

  for (let local_index = 0; local_index < labels.length; local_index++) {
    const x_px = local_index % width_px;
    const y_px = Math.floor(local_index / width_px);
    const is_edge =
      x_px === 0 ||
      y_px === 0 ||
      x_px === width_px - 1 ||
      y_px === height_px - 1;

    if (is_edge && labels[local_index] === GLYPH_LABEL) {
      labels[local_index] = OUTSIDE_LABEL;
      stack.push(local_index);
    }
  }

  while (stack.length > 0) {
    const local_index = stack.pop() as number;
    const x_px = local_index % width_px;
    const y_px = Math.floor(local_index / width_px);

    for (const [offset_x, offset_y] of NEIGHBOR_OFFSETS_8) {
      const next_x_px = x_px + offset_x;
      const next_y_px = y_px + offset_y;

      if (next_x_px < 0 || next_x_px >= width_px) continue;
      if (next_y_px < 0 || next_y_px >= height_px) continue;

      const next_index = next_y_px * width_px + next_x_px;

      if (labels[next_index] !== GLYPH_LABEL) continue;

      labels[next_index] = OUTSIDE_LABEL;
      stack.push(next_index);
    }
  }
}

function CollectGlyphRects(
  labels: Uint8Array,
  width_px: number,
  height_px: number
): Rect[] {
  const glyphs: Rect[] = [];
  const seen = new Uint8Array(labels.length);

  for (let start_index = 0; start_index < labels.length; start_index++) {
    if (labels[start_index] !== GLYPH_LABEL || seen[start_index] === 1) {
      continue;
    }

    const stack = [start_index];
    let glyph: Rect | null = null;
    let area_px = 0;

    seen[start_index] = 1;

    while (stack.length > 0) {
      const local_index = stack.pop() as number;
      const x_px = local_index % width_px;
      const y_px = Math.floor(local_index / width_px);
      const pixel_rect = {
        left_px: x_px,
        top_px: y_px,
        right_px: x_px + 1,
        bottom_px: y_px + 1
      };

      glyph = glyph ? UniteRects(glyph, pixel_rect) : pixel_rect;
      area_px++;

      for (const [offset_x, offset_y] of NEIGHBOR_OFFSETS_8) {
        const next_x_px = x_px + offset_x;
        const next_y_px = y_px + offset_y;

        if (next_x_px < 0 || next_x_px >= width_px) continue;
        if (next_y_px < 0 || next_y_px >= height_px) continue;

        const next_index = next_y_px * width_px + next_x_px;

        if (labels[next_index] !== GLYPH_LABEL || seen[next_index] === 1) {
          continue;
        }

        seen[next_index] = 1;
        stack.push(next_index);
      }
    }

    const is_glyph =
      glyph !== null &&
      area_px >= MIN_GLYPH_AREA_PX &&
      glyph.right_px - glyph.left_px <=
        width_px * MAX_GLYPH_SIDE_RATIO_OF_AREA &&
      glyph.bottom_px - glyph.top_px <=
        height_px * MAX_GLYPH_SIDE_RATIO_OF_AREA &&
      IsGlyphShaped(glyph, area_px);

    if (is_glyph && glyph) glyphs.push(glyph);
  }

  return glyphs;
}

/**
 * Glyphs are the pixels inside the closed area's bounds that are not part of
 * the white area and cannot reach the bounds' edge without crossing it.
 */
function AnalyzeClosedArea(
  bounds: Rect,
  members: Set<number>,
  image_width_px: number
): TextArea | null {
  const width_px = bounds.right_px - bounds.left_px;
  const height_px = bounds.bottom_px - bounds.top_px;
  const labels = new Uint8Array(width_px * height_px);
  const ToImageIndex = (local_index: number) =>
    (bounds.top_px + Math.floor(local_index / width_px)) * image_width_px +
    bounds.left_px +
    (local_index % width_px);

  for (let local_index = 0; local_index < labels.length; local_index++) {
    if (members.has(ToImageIndex(local_index))) {
      labels[local_index] = WHITE_LABEL;
    }
  }

  MarkOutside(labels, width_px, height_px);

  const glyphs = CollectGlyphRects(labels, width_px, height_px).map(glyph => ({
    left_px: glyph.left_px + bounds.left_px,
    top_px: glyph.top_px + bounds.top_px,
    right_px: glyph.right_px + bounds.left_px,
    bottom_px: glyph.bottom_px + bounds.top_px
  }));

  return BuildTextArea(bounds, glyphs, image_width_px, labels);
}

/** Text areas of the closed white bubbles and frames near the model box. */
export function FindClosedTextAreasNear(
  image: GrayImage,
  model_rect: Rect,
  expand_ratio: number,
  known_areas: Map<string, TextArea>
): TextArea[] {
  const window = ComputeSearchWindow(image, model_rect, expand_ratio);
  // The near pass seeds inside the model box; the wide pass across the whole
  // window, because the box may miss the bubble entirely.
  const is_near_pass = IsNearPass(expand_ratio);
  const seed_rect = is_near_pass ? IntersectRects(model_rect, window) : window;
  const seed_grid_size = is_near_pass ? SEED_GRID_SIZE : WIDE_SEED_GRID_SIZE;

  if (RectArea(seed_rect) === 0) return [];

  const visited = new Uint8Array(RectArea(window));
  const window_width_px = window.right_px - window.left_px;
  const areas = new Map<string, TextArea>();

  for (let row = 0; row < seed_grid_size; row++) {
    for (let column = 0; column < seed_grid_size; column++) {
      const seed_x_px = Math.floor(
        seed_rect.left_px +
          ((column + 0.5) / seed_grid_size) *
            (seed_rect.right_px - seed_rect.left_px)
      );
      const seed_y_px = Math.floor(
        seed_rect.top_px +
          ((row + 0.5) / seed_grid_size) *
            (seed_rect.bottom_px - seed_rect.top_px)
      );
      const visited_index =
        (seed_y_px - window.top_px) * window_width_px +
        seed_x_px -
        window.left_px;

      if (visited[visited_index] === 1) continue;
      if (
        image.pixels[seed_y_px * image.width_px + seed_x_px] < WHITE_MIN_GRAY
      ) {
        continue;
      }

      const closed_area = FillClosedWhiteArea(
        image,
        window,
        seed_x_px,
        seed_y_px,
        visited
      );

      if (!closed_area) continue;

      const area_key = CreateRectKey(closed_area.bounds);
      const text_area =
        known_areas.get(area_key) ??
        AnalyzeClosedArea(
          closed_area.bounds,
          closed_area.members,
          image.width_px
        );

      if (!text_area) continue;

      known_areas.set(area_key, text_area);
      areas.set(area_key, text_area);
    }
  }

  return [...areas.values()];
}
