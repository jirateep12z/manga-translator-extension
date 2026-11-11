import type {
  OcrBackendPreference,
  OcrRecognizer
} from '@/features/ocr-engine';
import type { ReferenceLineMatch } from './match-reference-lines';
import type { ParityLanguage } from './parity-groups';
import { MIN_GROUP_MATCH_RATE } from './parity-groups';

export type TileResult = {
  tile_id: string;
  recognizer: OcrRecognizer;
  ms_per_tile: number;
  is_recognizer_checked: boolean;
};
export type MeasureSummary = {
  reference_line_count: number;
  passed_line_count: number;
  match_rate: number;
  wrong_recognizer_tiles: string[];
};
export type ParityGroupSummary = {
  language: ParityLanguage;
  tile_count: number;
  gate: MeasureSummary;
  raw: MeasureSummary;
  median_ms_per_tile: number | null;
  is_passed: boolean;
};
type LineMatchResult = Pick<ReferenceLineMatch, 'is_passed'>;

const BACKEND_QUERY_KEY = 'backend';
const BACKEND_PREFERENCES: readonly OcrBackendPreference[] = [
  'auto',
  'webgpu',
  'wasm'
];
const DEFAULT_BACKEND_PREFERENCE: OcrBackendPreference = 'auto';

function IsBackendPreference(
  value: string | null
): value is OcrBackendPreference {
  return BACKEND_PREFERENCES.some(preference => preference === value);
}

/** Reads ?backend=auto|webgpu|wasm; anything else means 'auto'. */
export function ReadBackendPreference(search: string): OcrBackendPreference {
  const backend = new URLSearchParams(search).get(BACKEND_QUERY_KEY);

  return IsBackendPreference(backend) ? backend : DEFAULT_BACKEND_PREFERENCE;
}

export function ComputeMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted_values = values.toSorted((left, right) => left - right);
  const middle_index = Math.floor(sorted_values.length / 2);

  return sorted_values.length % 2 === 1
    ? sorted_values[middle_index]
    : (sorted_values[middle_index - 1] + sorted_values[middle_index]) / 2;
}

function SummarizeMeasure(
  matches: readonly LineMatchResult[],
  checked_tiles: readonly TileResult[],
  expected_recognizer: OcrRecognizer
): MeasureSummary {
  const reference_line_count = matches.length;
  const passed_line_count = matches.filter(match => match.is_passed).length;

  return {
    reference_line_count,
    passed_line_count,
    match_rate:
      reference_line_count === 0 ? 0 : passed_line_count / reference_line_count,
    wrong_recognizer_tiles: checked_tiles
      .filter(tile_result => tile_result.recognizer !== expected_recognizer)
      .map(tile_result => tile_result.tile_id)
  };
}

/**
 * Summarizes one language group (spec 0002 §15.2, as amended). The raw
 * measure checks the recognizer of every tile; the gate measure checks only
 * the tiles marked is_recognizer_checked. The group passes on the gate
 * measure: at least MIN_GROUP_MATCH_RATE of its counted lines matched, and
 * every checked tile used the expected recognizer.
 */
export function SummarizeParityGroup(input: {
  language: ParityLanguage;
  expected_recognizer: OcrRecognizer;
  gate_matches: readonly LineMatchResult[];
  raw_matches: readonly LineMatchResult[];
  tile_results: readonly TileResult[];
}): ParityGroupSummary {
  const gate = SummarizeMeasure(
    input.gate_matches,
    input.tile_results.filter(tile_result => tile_result.is_recognizer_checked),
    input.expected_recognizer
  );
  const raw = SummarizeMeasure(
    input.raw_matches,
    input.tile_results,
    input.expected_recognizer
  );

  return {
    language: input.language,
    tile_count: input.tile_results.length,
    gate,
    raw,
    median_ms_per_tile: ComputeMedian(
      input.tile_results.map(tile_result => tile_result.ms_per_tile)
    ),
    is_passed:
      gate.match_rate >= MIN_GROUP_MATCH_RATE &&
      gate.wrong_recognizer_tiles.length === 0
  };
}
