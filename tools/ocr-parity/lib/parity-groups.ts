import type { OcrRecognizer } from '@/features/ocr-engine';

export type ReferenceLine = {
  poly: [number, number][];
  text: string;
  score: number;
};
export type ReferenceTile = {
  tile_index: number;
  tile_file: string;
  lines: ReferenceLine[];
};
export type ReferencePage = {
  set_name: string;
  page_number: number;
  tiles: ReferenceTile[];
};
export type ReferenceRun = { run_name: string; pages: ReferencePage[] };
export type ParityLanguage = 'ko' | 'ja' | 'en';
export type ParityGroup = {
  language: ParityLanguage;
  reference_path: string;
  expected_recognizer: OcrRecognizer;
};

export const PARITY_GROUPS: readonly ParityGroup[] = [
  {
    language: 'ko',
    reference_path: '/fixtures/reference/ko.json',
    expected_recognizer: 'korean'
  },
  {
    language: 'ja',
    reference_path: '/fixtures/reference/ja.json',
    expected_recognizer: 'general'
  },
  {
    language: 'en',
    reference_path: '/fixtures/reference/en.json',
    expected_recognizer: 'general'
  }
];
export const MIN_REFERENCE_SCORE = 0.8;
export const MIN_MATCH_IOU = 0.3;
export const MAX_MATCH_CER = 0.1;
export const MIN_GROUP_MATCH_RATE = 0.95;
// A reference line is vertical by the rule of spec 0002 §6.4 step 1.
export const REFERENCE_VERTICAL_MIN_ASPECT_RATIO = 1.5;
export const ORT_WASM_ASSET_PATH = 'assets/ort-wasm-simd-threaded.jsep.wasm';
