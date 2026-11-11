import type { OcrLine } from '@/features/ocr-engine';
import type { BboxPx } from '@/services/database';
import { NESTED_GROUP_MIN_INSIDE_RATIO } from '../constants/ocr-reader';
import { ComputeIntersectionAreaPx, UnionBoxes } from './box-geometry';

type LineGroup = {
  lines: readonly OcrLine[];
  bbox_px: BboxPx;
  is_vertical: boolean;
};

type NestedPair = { outer_index: number; inner_index: number };

function CreateLineGroup(lines: readonly OcrLine[]): LineGroup {
  return {
    lines,
    bbox_px: UnionBoxes(lines.map(line => line.bbox_px)),
    is_vertical: lines[0].is_vertical
  };
}

function ReadBoxArea(box: BboxPx): number {
  return box.width_px * box.height_px;
}

// Horizontal text reads top to bottom, vertical text right to left.
function ReadOrderKey(box: BboxPx, is_vertical: boolean): number {
  return is_vertical
    ? -(box.x_px + box.width_px / 2)
    : box.y_px + box.height_px / 2;
}

function IsNestedIn(
  inner: LineGroup,
  outer: LineGroup,
  inner_index: number,
  outer_index: number
): boolean {
  const inner_area = ReadBoxArea(inner.bbox_px);
  const outer_area = ReadBoxArea(outer.bbox_px);
  const is_smaller =
    inner_area < outer_area ||
    (inner_area === outer_area && inner_index > outer_index);

  return (
    inner_area > 0 &&
    inner.is_vertical === outer.is_vertical &&
    is_smaller &&
    ComputeIntersectionAreaPx(inner.bbox_px, outer.bbox_px) >=
      NESTED_GROUP_MIN_INSIDE_RATIO * inner_area
  );
}

function FindNestedPair(groups: readonly LineGroup[]): NestedPair | null {
  for (let outer_index = 0; outer_index < groups.length; outer_index++) {
    for (let inner_index = 0; inner_index < groups.length; inner_index++) {
      if (
        inner_index !== outer_index &&
        IsNestedIn(
          groups[inner_index],
          groups[outer_index],
          inner_index,
          outer_index
        )
      ) {
        return { outer_index, inner_index };
      }
    }
  }

  return null;
}

// The outer lines keep their order; the inner lines go in as one block at the
// position of the block's center.
function InsertLineBlock(outer: LineGroup, inner: LineGroup): OcrLine[] {
  const block_key = ReadOrderKey(inner.bbox_px, outer.is_vertical);
  const insert_index = outer.lines.findIndex(
    line => ReadOrderKey(line.bbox_px, outer.is_vertical) > block_key
  );
  const split_index = insert_index === -1 ? outer.lines.length : insert_index;

  return [
    ...outer.lines.slice(0, split_index),
    ...inner.lines,
    ...outer.lines.slice(split_index)
  ];
}

/**
 * Joins a group whose box lies mostly inside a larger group's box of the same
 * orientation into that group (spec 0002 Section 22). Each input group is
 * non-empty and in reading order; the result keeps every container at its own
 * position.
 */
export function MergeNestedGroups(
  ordered_groups: readonly (readonly OcrLine[])[]
): OcrLine[][] {
  let groups = ordered_groups.map(CreateLineGroup);
  let nested_pair = FindNestedPair(groups);

  while (nested_pair) {
    const { outer_index, inner_index } = nested_pair;
    const merged_group = CreateLineGroup(
      InsertLineBlock(groups[outer_index], groups[inner_index])
    );

    groups = groups
      .map((group, group_index) =>
        group_index === outer_index ? merged_group : group
      )
      .filter((_, group_index) => group_index !== inner_index);
    nested_pair = FindNestedPair(groups);
  }

  return groups.map(group => [...group.lines]);
}
