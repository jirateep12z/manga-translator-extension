import type { OcrLine } from '@/features/ocr-engine';
import type { BboxPx } from '@/services/database';
import type { ReferenceLine } from './parity-groups';
import { MAX_MATCH_CER, MIN_MATCH_IOU } from './parity-groups';

export type ReferenceLineMatch = {
  is_passed: boolean;
  best_engine_text: string | null;
  best_cer: number | null;
};
type MatchCandidate = { text: string; cer: number; iou: number };

const WHITESPACE_PATTERN = /\s+/gu;
const PUNCTUATION_AND_SYMBOL_PATTERN = /[\p{P}\p{S}]/gu;
const NO_MATCH: ReferenceLineMatch = {
  is_passed: false,
  best_engine_text: null,
  best_cer: null
};

export function ToAxisAlignedBox(poly: readonly [number, number][]): BboxPx {
  const x_values = poly.map(([x_px]) => x_px);
  const y_values = poly.map(([, y_px]) => y_px);
  const left_px = Math.min(...x_values);
  const top_px = Math.min(...y_values);

  return {
    x_px: left_px,
    y_px: top_px,
    width_px: Math.max(...x_values) - left_px,
    height_px: Math.max(...y_values) - top_px
  };
}

export function ComputeIntersectionOverUnion(
  left: BboxPx,
  right: BboxPx
): number {
  const overlap_width_px =
    Math.min(left.x_px + left.width_px, right.x_px + right.width_px) -
    Math.max(left.x_px, right.x_px);
  const overlap_height_px =
    Math.min(left.y_px + left.height_px, right.y_px + right.height_px) -
    Math.max(left.y_px, right.y_px);
  const intersection_area =
    Math.max(0, overlap_width_px) * Math.max(0, overlap_height_px);
  const union_area =
    left.width_px * left.height_px +
    right.width_px * right.height_px -
    intersection_area;

  return union_area === 0 ? 0 : intersection_area / union_area;
}

export function NormalizeTextForCer(text: string): string {
  return text.normalize('NFKC').replace(WHITESPACE_PATTERN, '');
}

/**
 * The gate measure's normalization (spec 0002 §15.2, as amended): NFKC, then
 * whitespace, punctuation, and symbols removed.
 */
export function NormalizeTextForGate(text: string): string {
  return NormalizeTextForCer(text).replace(PUNCTUATION_AND_SYMBOL_PATTERN, '');
}

// Two-row Levenshtein distance over code points.
function ComputeEditDistance(
  reference_chars: readonly string[],
  candidate_chars: readonly string[]
): number {
  let previous_row = Array.from(
    { length: candidate_chars.length + 1 },
    (_, column_index) => column_index
  );

  for (const [row_index, reference_char] of reference_chars.entries()) {
    const current_row = [row_index + 1];

    for (const [column_index, candidate_char] of candidate_chars.entries()) {
      const substitution_cost = reference_char === candidate_char ? 0 : 1;

      current_row.push(
        Math.min(
          previous_row[column_index + 1] + 1,
          current_row[column_index] + 1,
          previous_row[column_index] + substitution_cost
        )
      );
    }

    previous_row = current_row;
  }

  return previous_row[candidate_chars.length];
}

/**
 * Character error rate (spec 0002 §15.2): the edit distance between the two
 * normalized texts, divided by the reference length. The raw measure
 * normalizes with NormalizeTextForCer, the gate measure with
 * NormalizeTextForGate.
 */
export function ComputeCharacterErrorRate(
  reference_text: string,
  candidate_text: string,
  NormalizeText: (text: string) => string = NormalizeTextForCer
): number {
  const reference_chars = Array.from(NormalizeText(reference_text));
  const candidate_chars = Array.from(NormalizeText(candidate_text));

  if (reference_chars.length === 0) return candidate_chars.length === 0 ? 0 : 1;

  return (
    ComputeEditDistance(reference_chars, candidate_chars) /
    reference_chars.length
  );
}

// Lowest CER first, then the higher IoU; ties keep the earlier line.
function IsBetterCandidate(
  candidate: MatchCandidate,
  best: MatchCandidate | null
): boolean {
  if (best === null) return true;
  if (candidate.cer !== best.cer) return candidate.cer < best.cer;

  return candidate.iou > best.iou;
}

/**
 * Matches one SDK reference line against the engine's lines (spec 0002
 * §15.2): an engine line overlapping it by at least MIN_MATCH_IOU, whose text
 * is within MAX_MATCH_CER after NormalizeText.
 */
export function MatchReferenceLine(
  reference: ReferenceLine,
  engine_lines: readonly OcrLine[],
  NormalizeText: (text: string) => string = NormalizeTextForCer
): ReferenceLineMatch {
  const reference_box = ToAxisAlignedBox(reference.poly);
  let best_candidate: MatchCandidate | null = null;

  for (const engine_line of engine_lines) {
    const iou = ComputeIntersectionOverUnion(
      reference_box,
      engine_line.bbox_px
    );

    if (iou < MIN_MATCH_IOU) continue;

    const candidate: MatchCandidate = {
      text: engine_line.text,
      cer: ComputeCharacterErrorRate(
        reference.text,
        engine_line.text,
        NormalizeText
      ),
      iou
    };

    if (IsBetterCandidate(candidate, best_candidate)) {
      best_candidate = candidate;
    }
  }

  if (best_candidate === null) return NO_MATCH;

  return {
    is_passed: best_candidate.cer <= MAX_MATCH_CER,
    best_engine_text: best_candidate.text,
    best_cer: best_candidate.cer
  };
}
