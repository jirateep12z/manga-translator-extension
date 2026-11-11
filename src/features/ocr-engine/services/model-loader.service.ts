import { AppError } from '@/lib/app-error';
import * as ort from 'onnxruntime-web';
import {
  MODELS_LOAD_FAILED_MESSAGE,
  OCR_MODEL_NAMES,
  OCR_MODELS_ASSET_DIR,
  ORT_ERROR_LOG_SEVERITY,
  ORT_WASM_ASSET_PATH
} from '../constants/ocr-engine';
import {
  ParseDetectionConfig,
  ParseRecognitionConfig
} from '../lib/parse-model-config';
import type {
  LoadedModel,
  OcrBackend,
  OcrModels,
  OcrSession,
  TensorData
} from '../types/ocr-engine';

type AssetUrlResolver = (asset_path: string) => string;
type ConfigParser<TConfig> = (value: unknown) => TConfig | null;

const CONFIG_FILE_NAME = 'config.json';
const MODEL_FILE_NAME = 'inference.onnx';
const FLOAT32_OUTPUT_MESSAGE =
  'The model returned an output that is not float32.';

function CreateOcrSession(session: ort.InferenceSession): OcrSession {
  return {
    async Run(input: TensorData): Promise<TensorData> {
      const results = await session.run({
        [session.inputNames[0]]: new ort.Tensor(
          'float32',
          input.data,
          input.dims
        )
      });
      const output = results[session.outputNames[0]];
      const output_data = await output.getData();

      if (!(output_data instanceof Float32Array)) {
        throw new Error(FLOAT32_OUTPUT_MESSAGE);
      }

      return { data: output_data, dims: output.dims };
    },
    async Release(): Promise<void> {
      await session.release();
    }
  };
}

async function FetchAsset(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  return response;
}

// The config is checked before the model file is downloaded.
async function LoadModel<TConfig>(
  ResolveAssetUrl: AssetUrlResolver,
  backend: OcrBackend,
  model_name: string,
  ParseConfig: ConfigParser<TConfig>
): Promise<LoadedModel<TConfig>> {
  const model_dir = `${OCR_MODELS_ASSET_DIR}/${model_name}`;
  const config_response = await FetchAsset(
    ResolveAssetUrl(`${model_dir}/${CONFIG_FILE_NAME}`)
  );
  const config = ParseConfig(await config_response.json());

  if (config === null) throw new Error(`Invalid config: ${model_name}`);

  const model_response = await FetchAsset(
    ResolveAssetUrl(`${model_dir}/${MODEL_FILE_NAME}`)
  );
  const session = await ort.InferenceSession.create(
    new Uint8Array(await model_response.arrayBuffer()),
    {
      executionProviders: [backend],
      graphOptimizationLevel: 'all',
      logSeverityLevel: ORT_ERROR_LOG_SEVERITY
    }
  );

  return { config, session: CreateOcrSession(session) };
}

async function ReleaseLoadedSessions(
  results: readonly PromiseSettledResult<LoadedModel<unknown>>[]
): Promise<void> {
  await Promise.allSettled(
    results.flatMap(result =>
      result.status === 'fulfilled' ? [result.value.session.Release()] : []
    )
  );
}

/**
 * Loads the detection model and both recognizers on one backend, in parallel
 * (spec 0002 §6.1 and §6.2). When any model fails, the sessions already
 * created are released and OCR_UNAVAILABLE is thrown.
 */
export async function LoadOcrModels(
  ResolveAssetUrl: AssetUrlResolver,
  backend: OcrBackend
): Promise<OcrModels> {
  ort.env.wasm.wasmPaths = { wasm: ResolveAssetUrl(ORT_WASM_ASSET_PATH) };

  const results = await Promise.allSettled([
    LoadModel(
      ResolveAssetUrl,
      backend,
      OCR_MODEL_NAMES.detection,
      ParseDetectionConfig
    ),
    LoadModel(
      ResolveAssetUrl,
      backend,
      OCR_MODEL_NAMES.general,
      ParseRecognitionConfig
    ),
    LoadModel(
      ResolveAssetUrl,
      backend,
      OCR_MODEL_NAMES.korean,
      ParseRecognitionConfig
    )
  ]);
  const [detection, general, korean] = results;

  if (
    detection.status === 'rejected' ||
    general.status === 'rejected' ||
    korean.status === 'rejected'
  ) {
    await ReleaseLoadedSessions(results);

    throw new AppError('OCR_UNAVAILABLE', MODELS_LOAD_FAILED_MESSAGE);
  }

  return {
    backend,
    detection: detection.value,
    recognizers: { general: general.value, korean: korean.value }
  };
}

/** Releases every session of the loaded models. Never rejects. */
export async function ReleaseOcrModels(models: OcrModels): Promise<void> {
  await Promise.allSettled([
    models.detection.session.Release(),
    models.recognizers.general.session.Release(),
    models.recognizers.korean.session.Release()
  ]);
}
