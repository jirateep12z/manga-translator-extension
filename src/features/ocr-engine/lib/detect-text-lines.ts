import {
  DETECTION_MAX_LINE_THICKNESS_RATIO,
  DETECTION_MIN_SIDE_PX
} from '../constants/ocr-engine';
import type {
  DetectedLine,
  DetectionPostProcessConfig,
  DetectionTile,
  DroppedComponent,
  PointPx,
  QuadPx,
  RotatedRectangle,
  TileDetection
} from '../types/ocr-engine';
import {
  ComputeMinAreaRectangle,
  OrderRectangleCorners
} from './min-area-rectangle';
import { ComputeQuadBounds, IsCroppableQuad } from './quad-geometry';

type RowEnds = { min_x: number; max_x: number };
type TextComponent = {
  pixel_count: number;
  row_ends: Map<number, RowEnds>;
  discovery_index: number;
};
type ComponentScan = {
  probability_map: Float32Array;
  map_width_px: number;
  map_height_px: number;
  thresh: number;
  is_visited: Uint8Array;
  pending_pixels: Int32Array;
};
type ScanBounds = {
  first_x: number;
  last_x: number;
  first_y: number;
  last_y: number;
};
type ScoredComponent = { rectangle: RotatedRectangle; box_score: number };
type DetectTextLinesInput = {
  probability_map: Float32Array;
  map_width_px: number;
  map_height_px: number;
  tile: DetectionTile;
  page_width_px: number;
  page_height_px: number;
  config: DetectionPostProcessConfig;
};

const MAP_SIZE_MISMATCH_MESSAGE =
  'The probability map does not match its size.';
const UNCLIPPED_MIN_SIDE_PX = DETECTION_MIN_SIDE_PX + 2;
// Pixel centers on the rectangle's border count as inside it.
const RECTANGLE_BORDER_TOLERANCE_PX = 1e-6;

function IsTextPixel(scan: ComponentScan, pixel_index: number): boolean {
  return scan.probability_map[pixel_index] > scan.thresh;
}

function PushNeighbors(
  scan: ComponentScan,
  x: number,
  y: number,
  stack_size: number
): number {
  let next_stack_size = stack_size;
  const last_y = Math.min(scan.map_height_px - 1, y + 1);
  const last_x = Math.min(scan.map_width_px - 1, x + 1);

  for (
    let neighbor_y = Math.max(0, y - 1);
    neighbor_y <= last_y;
    neighbor_y++
  ) {
    for (
      let neighbor_x = Math.max(0, x - 1);
      neighbor_x <= last_x;
      neighbor_x++
    ) {
      const neighbor_index = neighbor_y * scan.map_width_px + neighbor_x;

      if (scan.is_visited[neighbor_index]) continue;
      if (!IsTextPixel(scan, neighbor_index)) continue;

      scan.is_visited[neighbor_index] = 1;
      scan.pending_pixels[next_stack_size++] = neighbor_index;
    }
  }

  return next_stack_size;
}

// The row ends are updated in place: one object per row, not per pixel.
function RecordRowEnd(
  row_ends: Map<number, RowEnds>,
  x: number,
  y: number
): void {
  const row_end = row_ends.get(y);

  if (row_end === undefined) {
    row_ends.set(y, { min_x: x, max_x: x });

    return;
  }

  row_end.min_x = Math.min(row_end.min_x, x);
  row_end.max_x = Math.max(row_end.max_x, x);
}

// Collects one 8-connected component with an explicit stack, not recursion.
function CollectComponent(
  scan: ComponentScan,
  start_index: number,
  discovery_index: number
): TextComponent {
  const component: TextComponent = {
    pixel_count: 0,
    row_ends: new Map(),
    discovery_index
  };
  let stack_size = 0;

  scan.is_visited[start_index] = 1;
  scan.pending_pixels[stack_size++] = start_index;

  while (stack_size > 0) {
    const pixel_index = scan.pending_pixels[--stack_size];
    const x = pixel_index % scan.map_width_px;
    const y = (pixel_index - x) / scan.map_width_px;

    component.pixel_count++;
    RecordRowEnd(component.row_ends, x, y);
    stack_size = PushNeighbors(scan, x, y, stack_size);
  }

  return component;
}

// Scans rows top to bottom and columns left to right.
function FindTextComponents(
  probability_map: Float32Array,
  map_width_px: number,
  map_height_px: number,
  thresh: number
): TextComponent[] {
  const map_pixel_count = map_width_px * map_height_px;
  const scan: ComponentScan = {
    probability_map,
    map_width_px,
    map_height_px,
    thresh,
    is_visited: new Uint8Array(map_pixel_count),
    pending_pixels: new Int32Array(map_pixel_count)
  };
  const components: TextComponent[] = [];

  for (let pixel_index = 0; pixel_index < map_pixel_count; pixel_index++) {
    if (scan.is_visited[pixel_index]) continue;
    if (!IsTextPixel(scan, pixel_index)) continue;

    components.push(CollectComponent(scan, pixel_index, components.length));
  }

  return components;
}

function SelectCandidates(
  components: readonly TextComponent[],
  max_candidates: number
): TextComponent[] {
  return components
    .toSorted(
      (left, right) =>
        right.pixel_count - left.pixel_count ||
        left.discovery_index - right.discovery_index
    )
    .slice(0, max_candidates);
}

// The centers of each row's leftmost and rightmost pixels span the same
// convex hull as all of the component's pixel centers.
function ReadComponentPoints(component: TextComponent): PointPx[] {
  return [...component.row_ends].flatMap(([y, { min_x, max_x }]) =>
    min_x === max_x
      ? [{ x_px: min_x, y_px: y }]
      : [
          { x_px: min_x, y_px: y },
          { x_px: max_x, y_px: y }
        ]
  );
}

function ReadShorterSidePx(rectangle: RotatedRectangle): number {
  return Math.min(rectangle.width_px, rectangle.height_px);
}

function ComputeScanBounds(
  rectangle: RotatedRectangle,
  map_width_px: number,
  map_height_px: number
): ScanBounds {
  const corners = OrderRectangleCorners(rectangle);
  const x_values = corners.map(corner => corner.x_px);
  const y_values = corners.map(corner => corner.y_px);

  return {
    first_x: Math.max(0, Math.floor(Math.min(...x_values))),
    last_x: Math.min(map_width_px - 1, Math.ceil(Math.max(...x_values))),
    first_y: Math.max(0, Math.floor(Math.min(...y_values))),
    last_y: Math.min(map_height_px - 1, Math.ceil(Math.max(...y_values)))
  };
}

function IsInsideRectangle(
  rectangle: RotatedRectangle,
  x: number,
  y: number
): boolean {
  const { center_px, axis, width_px, height_px } = rectangle;
  const offset_x = x - center_px.x_px;
  const offset_y = y - center_px.y_px;

  return (
    Math.abs(offset_x * axis.x + offset_y * axis.y) <=
      width_px / 2 + RECTANGLE_BORDER_TOLERANCE_PX &&
    Math.abs(offset_y * axis.x - offset_x * axis.y) <=
      height_px / 2 + RECTANGLE_BORDER_TOLERANCE_PX
  );
}

// The mean probability of the map pixels whose centers lie inside the
// rectangle or on its border (spec 0002 §6.3 step 4).
function ComputeRectangleMean(
  input: DetectTextLinesInput,
  rectangle: RotatedRectangle
): number {
  const { probability_map, map_width_px, map_height_px } = input;
  const bounds = ComputeScanBounds(rectangle, map_width_px, map_height_px);
  let probability_sum = 0;
  let inside_count = 0;

  for (let y = bounds.first_y; y <= bounds.last_y; y++) {
    for (let x = bounds.first_x; x <= bounds.last_x; x++) {
      if (!IsInsideRectangle(rectangle, x, y)) continue;

      probability_sum += probability_map[y * map_width_px + x];
      inside_count++;
    }
  }

  return inside_count === 0 ? 0 : probability_sum / inside_count;
}

// Grows every side by d = area × unclip_ratio / perimeter (spec 0002 §6.3
// step 5), keeping the center and the angle.
function UnclipRectangle(
  rectangle: RotatedRectangle,
  unclip_ratio: number
): RotatedRectangle {
  const { width_px, height_px } = rectangle;
  const distance_px =
    (width_px * height_px * unclip_ratio) / (2 * (width_px + height_px));

  return {
    ...rectangle,
    width_px: width_px + 2 * distance_px,
    height_px: height_px + 2 * distance_px
  };
}

function MapCornerToPage(
  corner: PointPx,
  input: DetectTextLinesInput
): PointPx {
  const { tile } = input;
  const scale_x = tile.source_width_px / input.map_width_px;
  const scale_y = tile.source_height_px / input.map_height_px;

  return {
    x_px: Math.min(
      input.page_width_px,
      Math.max(0, tile.source_x_px + Math.round(corner.x_px * scale_x))
    ),
    y_px: Math.min(
      input.page_height_px,
      Math.max(0, tile.source_y_px + Math.round(corner.y_px * scale_y))
    )
  };
}

function MapQuadToPage(
  rectangle: RotatedRectangle,
  input: DetectTextLinesInput
): QuadPx {
  const [top_left, top_right, bottom_right, bottom_left] =
    OrderRectangleCorners(rectangle);

  return [
    MapCornerToPage(top_left, input),
    MapCornerToPage(top_right, input),
    MapCornerToPage(bottom_right, input),
    MapCornerToPage(bottom_left, input)
  ];
}

// Spec 0002 §6.3 steps 3–4: skips a component whose centers lie on one line,
// or whose rectangle is too thin or too thick to be a text line, and scores
// the rest.
function ScoreComponent(
  component: TextComponent,
  input: DetectTextLinesInput
): ScoredComponent | null {
  const rectangle = ComputeMinAreaRectangle(ReadComponentPoints(component));

  if (rectangle === null) return null;
  if (ReadShorterSidePx(rectangle) < DETECTION_MIN_SIDE_PX) return null;
  // A component thicker than half the map is not a text line (spec 0002
  // Section 23).
  if (
    ReadShorterSidePx(rectangle) >
    DETECTION_MAX_LINE_THICKNESS_RATIO *
      Math.min(input.map_width_px, input.map_height_px)
  ) {
    return null;
  }

  return { rectangle, box_score: ComputeRectangleMean(input, rectangle) };
}

// Spec 0002 §6.3 steps 5–10.
function CreateDetectedLine(
  rectangle: RotatedRectangle,
  input: DetectTextLinesInput
): DetectedLine | null {
  const unclipped_rectangle = UnclipRectangle(
    rectangle,
    input.config.unclip_ratio
  );

  if (ReadShorterSidePx(unclipped_rectangle) < UNCLIPPED_MIN_SIDE_PX) {
    return null;
  }

  const quad_px = MapQuadToPage(unclipped_rectangle, input);

  if (!IsCroppableQuad(quad_px)) return null;

  return { bbox_px: ComputeQuadBounds(quad_px), quad_px };
}

// The scored rectangle, before the unclip, in page pixels (spec 0002
// Section 24).
function CreateDroppedComponent(
  component: TextComponent,
  scored_component: ScoredComponent,
  input: DetectTextLinesInput
): DroppedComponent {
  return {
    bbox_px: ComputeQuadBounds(
      MapQuadToPage(scored_component.rectangle, input)
    ),
    box_score: scored_component.box_score,
    map_pixel_count: component.pixel_count
  };
}

/**
 * Turns one tile's detection probability map into text lines in page pixels
 * (spec 0002 §6.3, "Post-processing"): a rotated quad for each line and the
 * box that bounds it, and the components that the box score drops (as amended
 * by Section 24). Both come out in candidate order: largest component first.
 */
export function DetectTextLines(input: DetectTextLinesInput): TileDetection {
  const { probability_map, map_width_px, map_height_px, config } = input;

  if (probability_map.length !== map_width_px * map_height_px) {
    throw new Error(MAP_SIZE_MISMATCH_MESSAGE);
  }

  const components = FindTextComponents(
    probability_map,
    map_width_px,
    map_height_px,
    config.thresh
  );
  const detection: TileDetection = { lines: [], dropped_components: [] };

  for (const component of SelectCandidates(components, config.max_candidates)) {
    const scored_component = ScoreComponent(component, input);

    if (scored_component === null) continue;
    if (scored_component.box_score < config.box_thresh) {
      detection.dropped_components.push(
        CreateDroppedComponent(component, scored_component, input)
      );
      continue;
    }

    const detected_line = CreateDetectedLine(scored_component.rectangle, input);

    if (detected_line !== null) detection.lines.push(detected_line);
  }

  return detection;
}
