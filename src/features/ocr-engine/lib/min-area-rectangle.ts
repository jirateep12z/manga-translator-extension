import type {
  PointPx,
  QuadPx,
  RotatedRectangle,
  UnitVector
} from '../types/ocr-engine';

type Projection = {
  min_u: number;
  max_u: number;
  min_v: number;
  max_v: number;
};
type EdgeFit = {
  axis: UnitVector;
  normal: UnitVector;
  projection: Projection;
  area_px2: number;
};

// Areas this close are equal, so the first of equal edges wins.
const AREA_TIE_TOLERANCE_PX2 = 1e-6;
const MIN_HULL_POINT_COUNT = 3;
const CORNER_SIGNS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1]
] as const;

function ComparePoints(left: PointPx, right: PointPx): number {
  return left.x_px - right.x_px || left.y_px - right.y_px;
}

function Cross(origin: PointPx, first: PointPx, second: PointPx): number {
  return (
    (first.x_px - origin.x_px) * (second.y_px - origin.y_px) -
    (first.y_px - origin.y_px) * (second.x_px - origin.x_px)
  );
}

// One chain of Andrew's monotone chain. Popping on a zero cross product
// removes collinear and repeated points.
function BuildHullChain(sorted_points: readonly PointPx[]): PointPx[] {
  const chain: PointPx[] = [];

  for (const point of sorted_points) {
    while (
      chain.length >= 2 &&
      Cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
    ) {
      chain.pop();
    }

    chain.push(point);
  }

  return chain;
}

function ComputeConvexHull(points: readonly PointPx[]): PointPx[] {
  const sorted_points = points.toSorted(ComparePoints);

  if (sorted_points.length <= 2) return sorted_points;

  const lower_chain = BuildHullChain(sorted_points);
  const upper_chain = BuildHullChain(sorted_points.toReversed());

  return [...lower_chain.slice(0, -1), ...upper_chain.slice(0, -1)];
}

function ProjectPoints(
  points: readonly PointPx[],
  axis: UnitVector,
  normal: UnitVector
): Projection {
  const u_values = points.map(
    point => point.x_px * axis.x + point.y_px * axis.y
  );
  const v_values = points.map(
    point => point.x_px * normal.x + point.y_px * normal.y
  );

  return {
    min_u: Math.min(...u_values),
    max_u: Math.max(...u_values),
    min_v: Math.min(...v_values),
    max_v: Math.max(...v_values)
  };
}

// The rectangle with one side along the edge from start to end.
function FitEdge(
  hull: readonly PointPx[],
  start: PointPx,
  end: PointPx
): EdgeFit {
  const delta_x = end.x_px - start.x_px;
  const delta_y = end.y_px - start.y_px;
  const edge_length = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
  const axis = { x: delta_x / edge_length, y: delta_y / edge_length };
  const normal = { x: -axis.y, y: axis.x };
  const projection = ProjectPoints(hull, axis, normal);

  return {
    axis,
    normal,
    projection,
    area_px2:
      (projection.max_u - projection.min_u) *
      (projection.max_v - projection.min_v)
  };
}

/**
 * Finds the minimum-area rectangle around the points (spec 0002 §6.3 step 3).
 * One side lies along an edge of their convex hull. Returns null when the
 * points lie on one line. The hull of a component has tens of points, so
 * every edge is checked against every hull point.
 */
export function ComputeMinAreaRectangle(
  points: readonly PointPx[]
): RotatedRectangle | null {
  const hull = ComputeConvexHull(points);

  if (hull.length < MIN_HULL_POINT_COUNT) return null;

  const { axis, normal, projection } = hull
    .map((start, point_index) =>
      FitEdge(hull, start, hull[(point_index + 1) % hull.length])
    )
    .reduce((best_fit, edge_fit) =>
      edge_fit.area_px2 < best_fit.area_px2 - AREA_TIE_TOLERANCE_PX2
        ? edge_fit
        : best_fit
    );
  const center_u = (projection.min_u + projection.max_u) / 2;
  const center_v = (projection.min_v + projection.max_v) / 2;

  return {
    center_px: {
      x_px: center_u * axis.x + center_v * normal.x,
      y_px: center_u * axis.y + center_v * normal.y
    },
    axis,
    width_px: projection.max_u - projection.min_u,
    height_px: projection.max_v - projection.min_v
  };
}

/**
 * Orders a rectangle's corners as PaddleOCR does (spec 0002 §6.3 step 7):
 * top-left, top-right, bottom-right, bottom-left.
 */
export function OrderRectangleCorners(rectangle: RotatedRectangle): QuadPx {
  const { center_px, axis, width_px, height_px } = rectangle;
  const normal = { x: -axis.y, y: axis.x };
  const corners = CORNER_SIGNS.map(([width_sign, height_sign]) => ({
    x_px:
      center_px.x_px +
      (width_sign * width_px * axis.x) / 2 +
      (height_sign * height_px * normal.x) / 2,
    y_px:
      center_px.y_px +
      (width_sign * width_px * axis.y) / 2 +
      (height_sign * height_px * normal.y) / 2
  }));
  const [left_first, left_second, right_first, right_second] =
    corners.toSorted(ComparePoints);
  const [top_left, bottom_left] =
    left_second.y_px > left_first.y_px
      ? [left_first, left_second]
      : [left_second, left_first];
  const [top_right, bottom_right] =
    right_second.y_px > right_first.y_px
      ? [right_first, right_second]
      : [right_second, right_first];

  return [top_left, top_right, bottom_right, bottom_left];
}
