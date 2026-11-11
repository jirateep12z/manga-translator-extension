import { ScoreMatch } from './block-scoring';
import { IntersectRects, RectArea, UniteRects, type Rect } from './geometry';
import type { TextArea } from './types';

const MAX_ASSIGNMENT_SEARCH_SIZE = 50_000;

type BlockMatch = { region_index: number; block_index: number; score: number };

/** Pairs regions and blocks best-first. */
function PairBlocksGreedily(matches: BlockMatch[]): BlockMatch[] {
  const pairs: BlockMatch[] = [];
  const used_region_indexes = new Set<number>();
  const used_block_indexes = new Set<number>();

  for (const match of [...matches].sort(
    (left, right) => right.score - left.score
  )) {
    if (match.score === 0) break;
    if (used_region_indexes.has(match.region_index)) continue;
    if (used_block_indexes.has(match.block_index)) continue;

    pairs.push(match);
    used_region_indexes.add(match.region_index);
    used_block_indexes.add(match.block_index);
  }

  return pairs;
}

/**
 * Pairs regions and blocks for the highest total score. A loose box can cover
 * two captions best-first, which would hand its neighbor's caption to it.
 */
function PairBlocksOptimally(
  matches: BlockMatch[],
  region_indexes: number[],
  block_count: number
): BlockMatch[] {
  if (
    Math.pow(block_count + 1, region_indexes.length) >
    MAX_ASSIGNMENT_SEARCH_SIZE
  ) {
    return PairBlocksGreedily(matches);
  }

  const score_by_pair = new Map(
    matches.map(match => [`${match.region_index}:${match.block_index}`, match])
  );
  let best_pairs: BlockMatch[] = [];
  let best_total = 0;
  const Search = (
    position: number,
    used: Set<number>,
    pairs: BlockMatch[],
    total: number
  ) => {
    if (position === region_indexes.length) {
      if (total > best_total) {
        best_total = total;
        best_pairs = pairs;
      }

      return;
    }

    Search(position + 1, used, pairs, total);

    for (let block_index = 0; block_index < block_count; block_index++) {
      const match = score_by_pair.get(
        `${region_indexes[position]}:${block_index}`
      );

      if (used.has(block_index) || !match || match.score === 0) continue;

      Search(
        position + 1,
        new Set([...used, block_index]),
        [...pairs, match],
        total + match.score
      );
    }
  };

  Search(0, new Set(), [], 0);

  return best_pairs;
}

/** Pairs regions with blocks, then gives leftover blocks to overlapping regions. */
export function AssignBlocks(
  area: TextArea,
  region_indexes: number[],
  model_rects: Rect[],
  character_counts: number[],
  reach_ratio: number
): Map<number, Rect> {
  const matches: BlockMatch[] = region_indexes.flatMap(region_index =>
    area.blocks.map((block, block_index) => ({
      region_index,
      block_index,
      score: ScoreMatch(
        model_rects[region_index],
        block,
        character_counts[region_index],
        reach_ratio
      )
    }))
  );
  const region_boxes = new Map<number, Rect>();
  const used_block_indexes = new Set<number>();

  for (const pair of PairBlocksOptimally(
    matches,
    region_indexes,
    area.blocks.length
  )) {
    region_boxes.set(pair.region_index, area.blocks[pair.block_index].rect);
    used_block_indexes.add(pair.block_index);
  }

  for (const [block_index, { rect: block }] of area.blocks.entries()) {
    if (used_block_indexes.has(block_index)) continue;

    const overlapping_match = matches
      .filter(
        match =>
          match.block_index === block_index &&
          RectArea(IntersectRects(model_rects[match.region_index], block)) > 0
      )
      .sort((left, right) => right.score - left.score)[0];
    const region_box =
      overlapping_match && region_boxes.get(overlapping_match.region_index);

    if (overlapping_match && region_box) {
      region_boxes.set(
        overlapping_match.region_index,
        UniteRects(region_box, block)
      );
    }
  }

  return region_boxes;
}
