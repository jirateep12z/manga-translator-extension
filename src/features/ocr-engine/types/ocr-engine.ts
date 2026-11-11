import type { BboxPx } from '@/services/database';

export type OcrBackend = 'webgpu' | 'wasm';
export type OcrBackendPreference = 'auto' | OcrBackend;
export type OcrRecognizer = 'general' | 'korean';
export type OcrLine = {
  bbox_px: BboxPx;
  text: string;
  score: number;
  is_vertical: boolean;
};
export type OcrReadPageResult = {
  width_px: number;
  height_px: number;
  backend: OcrBackend;
  detection_model: string;
  recognizer: OcrRecognizer;
  recognition_model: string;
  tile_count: number;
  lines: OcrLine[];
  duration_ms: { decode: number; detection: number; recognition: number };
};
export type OcrWarmUpResult = { backend: OcrBackend };
export type OcrEngine = {
  ReadPage(image_blob: Blob): Promise<OcrReadPageResult>;
  WarmUp(): Promise<OcrWarmUpResult>;
  Dispose(): Promise<void>;
};
export type CreateOcrEngineOptions = {
  ResolveAssetUrl: (asset_path: string) => string;
  backend_preference?: OcrBackendPreference; // default 'auto'
};

export type DetectionTile = {
  source_x_px: number;
  source_y_px: number;
  source_width_px: number;
  source_height_px: number;
};
export type DetectionInputSize = { width_px: number; height_px: number };
export type PointPx = { x_px: number; y_px: number };
// Top-left, top-right, bottom-right, bottom-left (spec 0002 §6.3 step 7).
export type QuadPx = readonly [PointPx, PointPx, PointPx, PointPx];
export type QuadCrop = {
  width_px: number;
  height_px: number;
  is_vertical: boolean;
};
// A canvas matrix (DOMMatrix2DInit): x' = a·x + c·y + e, y' = b·x + d·y + f.
export type CropTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};
export type UnitVector = { x: number; y: number };
// width_px runs along axis, and height_px along the normal (−axis.y, axis.x).
export type RotatedRectangle = {
  center_px: PointPx;
  axis: UnitVector;
  width_px: number;
  height_px: number;
};
export type DetectedLine = { bbox_px: BboxPx; quad_px: QuadPx };
// A component that the box score dropped (spec 0002 §6.3 step 4, as amended
// by Section 24): its rectangle's bounds in page pixels, its box score, and
// its size in map pixels.
export type DroppedComponent = {
  bbox_px: BboxPx;
  box_score: number;
  map_pixel_count: number;
};
export type TileDetection = {
  lines: DetectedLine[];
  dropped_components: DroppedComponent[];
};
// The second pass's seeds (spec 0002 Section 24): the boxes of the
// first-pass lines and of the dropped components to read again, and the
// lower median thickness of the thin lines, or null when there is none.
export type Suspects = {
  line_boxes: BboxPx[];
  dropped_boxes: BboxPx[];
  reference_thickness_px: number | null;
};
// The second pass's lines (spec 0002 Section 24): the kept first-pass lines,
// then the added crop lines.
export type CombinedLines = {
  lines: DetectedLine[];
  first_pass_line_count: number;
};
export type PixelNormalization = {
  scale: number;
  mean: readonly [number, number, number];
  std: readonly [number, number, number];
};
export type DetectionPostProcessConfig = {
  thresh: number;
  box_thresh: number;
  unclip_ratio: number;
  max_candidates: number;
};
export type DetectionConfig = {
  model_name: string;
} & DetectionPostProcessConfig &
  PixelNormalization;
export type RecognitionConfig = {
  model_name: string;
  image_shape: readonly [number, number, number];
  character_dict: readonly string[];
};
export type RecognitionLine = {
  line_index: number;
  bbox_px: BboxPx;
  quad_px: QuadPx;
  is_vertical: boolean;
};
export type RecognitionCrop = RecognitionLine & { resized_width_px: number };
export type RecognitionBatch = { crops: RecognitionCrop[]; width_px: number };
export type DecodedText = { text: string; score: number };
export type TensorData = { data: Float32Array; dims: readonly number[] };
export type OcrSession = {
  Run(input: TensorData): Promise<TensorData>;
  Release(): Promise<void>;
};
export type LoadedModel<TConfig> = { config: TConfig; session: OcrSession };
export type OcrModels = {
  backend: OcrBackend;
  detection: LoadedModel<DetectionConfig>;
  recognizers: Record<OcrRecognizer, LoadedModel<RecognitionConfig>>;
};
