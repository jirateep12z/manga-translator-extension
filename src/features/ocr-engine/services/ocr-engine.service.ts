import { AppError, IsAppError } from '@/lib/app-error';
import type { ErrorCode } from '@/types/error-code';
import {
  DETECTION_UPSCALE,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_OCR_IMAGE_PIXELS,
  MODELS_LOAD_FAILED_MESSAGE,
  PAGE_READ_FAILED_MESSAGE,
  RECOGNITION_NORMALIZATION,
  RECOGNIZER_SAMPLE_LINE_COUNT,
  SMALL_LETTERING_MAX_THICKNESS_PX,
  SUSPECT_CROP_MARGIN_RATIO,
  WARM_UP_CROP_SIDE_PX,
  WARM_UP_IMAGE_SIDE_PX,
  WEBGPU_UNAVAILABLE_MESSAGE
} from '../constants/ocr-engine';
import { CombineCropLines } from '../lib/combine-crop-lines';
import {
  ComputeDetectionInputSize,
  ComputeDetectionTiles
} from '../lib/compute-detection-tiles';
import { ComputeSuspectCrops } from '../lib/compute-suspect-crops';
import { BuildCharacterClasses, DecodeCtcBatch } from '../lib/decode-ctc';
import { DetectTextLines } from '../lib/detect-text-lines';
import { IsSmallLettering } from '../lib/is-small-lettering';
import { MergeTileLines } from '../lib/merge-tile-lines';
import { PlanRecognitionBatches } from '../lib/plan-recognition-batches';
import { CreateBoxQuad, MeasureQuadCrop } from '../lib/quad-geometry';
import {
  ChooseRecognizer,
  PickRecognizerSample
} from '../lib/select-recognizer';
import { SelectSuspects } from '../lib/select-suspects';
import type {
  CreateOcrEngineOptions,
  DecodedText,
  DetectedLine,
  DetectionTile,
  DroppedComponent,
  OcrBackend,
  OcrEngine,
  OcrLine,
  OcrModels,
  OcrReadPageResult,
  OcrRecognizer,
  OcrWarmUpResult,
  RecognitionLine
} from '../types/ocr-engine';
import {
  BuildDetectionInput,
  BuildRecognitionInput,
  CreateWhiteImage,
  DecodePageImage
} from './image-tensor.service';
import { LoadOcrModels, ReleaseOcrModels } from './model-loader.service';

// The character classes are cached per loaded models, so a new set of models
// always starts with an empty cache.
type LoadedModels = {
  models: OcrModels;
  character_classes: Map<OcrRecognizer, readonly string[]>;
};
type EngineState = {
  loaded: LoadedModels | null;
  is_webgpu_disabled: boolean;
  queue_tail: Promise<unknown>;
};
type DetectedTiles = {
  tile_lines: DetectedLine[][];
  dropped_components: DroppedComponent[];
};
// `lines` starts with the `first_pass_line_count` kept first-pass lines.
type DetectedPage = {
  lines: DetectedLine[];
  tile_count: number;
  first_pass_line_count: number;
};
type RecognizedPage = { recognizer: OcrRecognizer; lines: OcrLine[] };
type EngineInitOutcome = 'succeeded' | 'failed';

const ENGINE_INIT_LOG_EVENT = '[offscreen] ocr-engine-init';
const IMAGE_CHANNEL_COUNT = 3;
const BATCH_MISMATCH_MESSAGE =
  'The recognition output does not match its batch.';
const WARM_UP_RECOGNIZERS: readonly OcrRecognizer[] = ['general', 'korean'];
const WARM_UP_BOX = {
  x_px: 0,
  y_px: 0,
  width_px: WARM_UP_CROP_SIDE_PX,
  height_px: WARM_UP_CROP_SIDE_PX
};
const WARM_UP_LINE: RecognitionLine = {
  line_index: 0,
  bbox_px: WARM_UP_BOX,
  quad_px: CreateBoxQuad(WARM_UP_BOX),
  is_vertical: false
};

function MeasureSince(started_at_ms: number): number {
  return Math.round(performance.now() - started_at_ms);
}

function ToAppError(
  error: unknown,
  error_code: ErrorCode,
  message: string
): AppError {
  return IsAppError(error) ? error : new AppError(error_code, message);
}

async function IsWebGpuAvailable(): Promise<boolean> {
  const gpu: GPU | undefined = globalThis.navigator?.gpu;

  if (gpu === undefined || gpu === null) return false;

  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

function ReadCharacterClasses(
  loaded: LoadedModels,
  recognizer: OcrRecognizer,
  class_count: number
): readonly string[] {
  const cached_classes = loaded.character_classes.get(recognizer);

  if (cached_classes !== undefined) return cached_classes;

  const character_classes = BuildCharacterClasses(
    loaded.models.recognizers[recognizer].config.character_dict,
    class_count
  );

  loaded.character_classes.set(recognizer, character_classes);

  return character_classes;
}

// Spec 0002 §6.3: every tile is detected; the lines stay grouped by tile, and
// the dropped components of all tiles are collected in tile order (Section
// 24).
async function DetectTileLines(
  models: OcrModels,
  image: ImageBitmap,
  tiles: readonly DetectionTile[],
  upscale: number
): Promise<DetectedTiles> {
  const { config, session } = models.detection;
  const tile_lines: DetectedLine[][] = [];
  const tile_dropped_components: DroppedComponent[][] = [];

  for (const tile of tiles) {
    const input_size = ComputeDetectionInputSize(
      tile.source_width_px,
      tile.source_height_px,
      upscale
    );
    const data = await BuildDetectionInput(image, tile, input_size, config);
    const output = await session.Run({
      data,
      dims: [1, IMAGE_CHANNEL_COUNT, input_size.height_px, input_size.width_px]
    });
    const [, , map_height_px, map_width_px] = output.dims;
    const detection = DetectTextLines({
      probability_map: output.data,
      map_width_px,
      map_height_px,
      tile,
      page_width_px: image.width,
      page_height_px: image.height,
      config
    });

    tile_lines.push(detection.lines);
    tile_dropped_components.push(detection.dropped_components);
  }

  return {
    tile_lines,
    dropped_components: tile_dropped_components.flat()
  };
}

/**
 * Spec 0002 §6.3, as amended by Sections 23 and 24: the first pass reads the
 * page as it is and merges its tiles' duplicate lines. When its lines are
 * small lettering, or a component that its box score drops is worth a second
 * look, the suspect text is detected again in crops at DETECTION_UPSCALE, and
 * the crops' lines are combined with the first pass's: the first pass wins.
 * `tile_count` counts the tiles of both passes.
 */
async function DetectPageLines(
  models: OcrModels,
  image: ImageBitmap
): Promise<DetectedPage> {
  const first_tiles = ComputeDetectionTiles(image.width, image.height);
  const first_pass = await DetectTileLines(models, image, first_tiles, 1);
  const first_lines = MergeTileLines(first_pass.tile_lines);
  const first_page: DetectedPage = {
    lines: first_lines,
    tile_count: first_tiles.length,
    first_pass_line_count: first_lines.length
  };
  const suspects = SelectSuspects(first_lines, first_pass.dropped_components);

  if (!IsSmallLettering(first_lines) && suspects.dropped_boxes.length === 0) {
    return first_page;
  }

  const crops = ComputeSuspectCrops(
    [...suspects.line_boxes, ...suspects.dropped_boxes],
    SUSPECT_CROP_MARGIN_RATIO *
      (suspects.reference_thickness_px ?? SMALL_LETTERING_MAX_THICKNESS_PX),
    image.width,
    image.height
  );

  if (crops.length === 0) return first_page;

  const crop_pass = await DetectTileLines(
    models,
    image,
    crops,
    DETECTION_UPSCALE
  );
  const combined_lines = CombineCropLines(
    first_lines,
    crop_pass.tile_lines.flat()
  );

  return {
    lines: combined_lines.lines,
    tile_count: first_tiles.length + crops.length,
    first_pass_line_count: combined_lines.first_pass_line_count
  };
}

// Spec 0002 §6.4: returns the decoded results in the order of lines.
async function RecognizeLines(
  loaded: LoadedModels,
  recognizer: OcrRecognizer,
  image: ImageBitmap,
  lines: readonly RecognitionLine[]
): Promise<DecodedText[]> {
  const { config, session } = loaded.models.recognizers[recognizer];
  const [, image_height_px] = config.image_shape;
  const decoded_by_line = new Map<number, DecodedText>();

  for (const batch of PlanRecognitionBatches(lines, config.image_shape)) {
    const data = await BuildRecognitionInput(
      image,
      batch,
      image_height_px,
      RECOGNITION_NORMALIZATION
    );
    const output = await session.Run({
      data,
      dims: [
        batch.crops.length,
        IMAGE_CHANNEL_COUNT,
        image_height_px,
        batch.width_px
      ]
    });
    const decoded_texts = DecodeCtcBatch(
      output,
      ReadCharacterClasses(loaded, recognizer, output.dims[2])
    );

    if (decoded_texts.length !== batch.crops.length) {
      throw new Error(BATCH_MISMATCH_MESSAGE);
    }

    for (const [crop_index, crop] of batch.crops.entries()) {
      decoded_by_line.set(crop.line_index, decoded_texts[crop_index]);
    }
  }

  return lines.map(line => {
    const decoded_text = decoded_by_line.get(line.line_index);

    if (decoded_text === undefined) throw new Error(BATCH_MISMATCH_MESSAGE);

    return decoded_text;
  });
}

function CreateRecognitionLines(
  detected_lines: readonly DetectedLine[]
): RecognitionLine[] {
  return detected_lines.map(({ bbox_px, quad_px }, line_index) => ({
    line_index,
    bbox_px,
    quad_px,
    is_vertical: MeasureQuadCrop(quad_px).is_vertical
  }));
}

function MapDecodedTexts(
  lines: readonly RecognitionLine[],
  decoded_texts: readonly DecodedText[],
  decoded_by_line: Map<number, DecodedText>
): void {
  for (const [line_position, line] of lines.entries()) {
    decoded_by_line.set(line.line_index, decoded_texts[line_position]);
  }
}

/**
 * Spec 0002 §6.5 and §21: both recognizers read a sample of the largest lines,
 * the one that `ChooseRecognizer` picks reads the rest, and its sample results
 * are kept. The sample comes from the first `first_pass_line_count` lines, the
 * kept first-pass lines, or from all lines when there is none (Section 24).
 */
async function RecognizePage(
  loaded: LoadedModels,
  image: ImageBitmap,
  detected_lines: readonly DetectedLine[],
  first_pass_line_count: number
): Promise<RecognizedPage> {
  const lines = CreateRecognitionLines(detected_lines);

  if (lines.length === 0) return { recognizer: 'general', lines: [] };

  const sample_pool =
    first_pass_line_count > 0 ? lines.slice(0, first_pass_line_count) : lines;
  const sample_lines = PickRecognizerSample(
    sample_pool,
    RECOGNIZER_SAMPLE_LINE_COUNT
  );
  const general_sample = await RecognizeLines(
    loaded,
    'general',
    image,
    sample_lines
  );
  const korean_sample = await RecognizeLines(
    loaded,
    'korean',
    image,
    sample_lines
  );
  const recognizer = ChooseRecognizer(general_sample, korean_sample);
  const sample_line_indices = new Set(
    sample_lines.map(line => line.line_index)
  );
  const remaining_lines = lines.filter(
    line => !sample_line_indices.has(line.line_index)
  );
  const remaining_texts = await RecognizeLines(
    loaded,
    recognizer,
    image,
    remaining_lines
  );
  const decoded_by_line = new Map<number, DecodedText>();

  MapDecodedTexts(
    sample_lines,
    recognizer === 'korean' ? korean_sample : general_sample,
    decoded_by_line
  );
  MapDecodedTexts(remaining_lines, remaining_texts, decoded_by_line);

  return {
    recognizer,
    lines: lines.flatMap(line => {
      const decoded_text = decoded_by_line.get(line.line_index);

      if (decoded_text === undefined || decoded_text.text === '') return [];

      return [
        {
          bbox_px: line.bbox_px,
          text: decoded_text.text,
          score: decoded_text.score,
          is_vertical: line.is_vertical
        }
      ];
    })
  };
}

async function ReadPageWithModels(
  loaded: LoadedModels,
  image_blob: Blob
): Promise<OcrReadPageResult> {
  const { models } = loaded;
  const decode_started_at_ms = performance.now();
  const image = await DecodePageImage(image_blob);

  try {
    const decode_ms = MeasureSince(decode_started_at_ms);

    if (image.width * image.height > MAX_OCR_IMAGE_PIXELS) {
      throw new AppError('OCR_FAILED', IMAGE_TOO_LARGE_MESSAGE);
    }

    const detection_started_at_ms = performance.now();
    const {
      lines: detected_lines,
      tile_count,
      first_pass_line_count
    } = await DetectPageLines(models, image);
    const detection_ms = MeasureSince(detection_started_at_ms);
    const recognition_started_at_ms = performance.now();
    const { recognizer, lines } = await RecognizePage(
      loaded,
      image,
      detected_lines,
      first_pass_line_count
    );
    const recognition_ms = MeasureSince(recognition_started_at_ms);

    return {
      width_px: image.width,
      height_px: image.height,
      backend: models.backend,
      detection_model: models.detection.config.model_name,
      recognizer,
      recognition_model: models.recognizers[recognizer].config.model_name,
      tile_count,
      lines,
      duration_ms: {
        decode: decode_ms,
        detection: detection_ms,
        recognition: recognition_ms
      }
    };
  } finally {
    image.close();
  }
}

// Spec 0002 §6.6: runs every model once, which also checks each
// recognizer's class count.
async function WarmUpModels(loaded: LoadedModels): Promise<OcrWarmUpResult> {
  const image = await CreateWhiteImage(
    WARM_UP_IMAGE_SIDE_PX,
    WARM_UP_IMAGE_SIDE_PX
  );

  try {
    await DetectPageLines(loaded.models, image);

    for (const recognizer of WARM_UP_RECOGNIZERS) {
      await RecognizeLines(loaded, recognizer, image, [WARM_UP_LINE]);
    }

    return { backend: loaded.models.backend };
  } finally {
    image.close();
  }
}

/**
 * Creates an on-device OCR engine (spec 0002 §5.6 and §6). Calls run one at a
 * time, in call order. In 'auto' mode, a WebGPU failure switches the engine to
 * WASM for the rest of its life.
 */
export function CreateOcrEngine(options: CreateOcrEngineOptions): OcrEngine {
  const backend_preference = options.backend_preference ?? 'auto';
  const state: EngineState = {
    loaded: null,
    is_webgpu_disabled: false,
    queue_tail: Promise.resolve()
  };

  function Enqueue<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    const result = state.queue_tail.then(task);

    state.queue_tail = result.catch(() => undefined);

    return result;
  }

  function IsAutoWebGpu(backend: OcrBackend): boolean {
    return backend_preference === 'auto' && backend === 'webgpu';
  }

  async function SelectBackend(): Promise<OcrBackend> {
    if (backend_preference === 'wasm') return 'wasm';
    if (backend_preference === 'webgpu') {
      if (await IsWebGpuAvailable()) return 'webgpu';

      throw new AppError('OCR_UNAVAILABLE', WEBGPU_UNAVAILABLE_MESSAGE);
    }

    if (state.is_webgpu_disabled) return 'wasm';

    return (await IsWebGpuAvailable()) ? 'webgpu' : 'wasm';
  }

  async function LoadModelsWithLog(backend: OcrBackend): Promise<OcrModels> {
    const started_at_ms = performance.now();
    let outcome: EngineInitOutcome = 'failed';

    try {
      const models = await LoadOcrModels(options.ResolveAssetUrl, backend);

      outcome = 'succeeded';

      return models;
    } finally {
      console.info(ENGINE_INIT_LOG_EVENT, {
        backend,
        is_cross_origin_isolated: globalThis.crossOriginIsolated === true,
        init_ms: MeasureSince(started_at_ms),
        outcome
      });
    }
  }

  async function LoadModels(backend: OcrBackend): Promise<OcrModels> {
    try {
      return await LoadModelsWithLog(backend);
    } catch (error) {
      if (!IsAutoWebGpu(backend)) throw error;

      state.is_webgpu_disabled = true;

      return LoadModelsWithLog('wasm');
    }
  }

  async function EnsureModels(): Promise<LoadedModels> {
    if (state.loaded !== null) return state.loaded;

    const backend = await SelectBackend();

    try {
      state.loaded = {
        models: await LoadModels(backend),
        character_classes: new Map()
      };

      return state.loaded;
    } catch (error) {
      throw ToAppError(error, 'OCR_UNAVAILABLE', MODELS_LOAD_FAILED_MESSAGE);
    }
  }

  async function ClearModels(): Promise<void> {
    const { loaded } = state;

    if (loaded === null) return;

    state.loaded = null;
    await ReleaseOcrModels(loaded.models);
  }

  // An unclassified failure on auto-selected WebGPU is retried once on WASM.
  async function RunWithFallback<TResult>(
    task: (loaded: LoadedModels) => Promise<TResult>
  ): Promise<TResult> {
    const loaded = await EnsureModels();

    try {
      return await task(loaded);
    } catch (error) {
      if (IsAppError(error) || !IsAutoWebGpu(loaded.models.backend)) {
        throw error;
      }

      state.is_webgpu_disabled = true;
      await ClearModels();

      return task(await EnsureModels());
    }
  }

  return {
    ReadPage(image_blob: Blob): Promise<OcrReadPageResult> {
      return Enqueue(async () => {
        try {
          return await RunWithFallback(loaded =>
            ReadPageWithModels(loaded, image_blob)
          );
        } catch (error) {
          throw ToAppError(error, 'OCR_FAILED', PAGE_READ_FAILED_MESSAGE);
        }
      });
    },
    WarmUp(): Promise<OcrWarmUpResult> {
      return Enqueue(async () => {
        try {
          return await RunWithFallback(WarmUpModels);
        } catch (error) {
          throw ToAppError(
            error,
            'OCR_UNAVAILABLE',
            MODELS_LOAD_FAILED_MESSAGE
          );
        }
      });
    },
    Dispose(): Promise<void> {
      return Enqueue(ClearModels);
    }
  };
}
