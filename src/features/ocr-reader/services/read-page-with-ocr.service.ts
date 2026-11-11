import type { OcrReadPageResult } from '@/features/ocr-engine';
import type { GlyphHint } from '@/features/region-appearance';
import type { ReadingDirection } from '@/features/settings';
import { AppError, ToErrorCode } from '@/lib/app-error';
import { ArrayBufferToBase64, ComputeBase64Length } from '@/lib/base64';
import type { SourceLanguage, TextRegion } from '@/services/database';
import type { ErrorCode } from '@/types/error-code';
import {
  MAX_OCR_IMAGE_BASE64_LENGTH,
  OCR_OFFSCREEN_TARGET
} from '../constants/ocr-offscreen';
import {
  AssembleOcrRegions,
  type OcrRegionAssembly
} from '../lib/assemble-regions';
import { IsOcrReadPageReply } from '../lib/is-ocr-message';
import { SendOcrRequest } from './offscreen-client.service';

const READ_PAGE_LOG_EVENT = '[background] ocr-read-page';
const IMAGE_TOO_LARGE_MESSAGE =
  'The image is too large to read on this device.';

export type OcrPageReading = {
  width_px: number;
  height_px: number;
  source_language: SourceLanguage;
  regions: TextRegion[];
  glyph_hints: GlyphHint[];
  model: string; // '<detection_model>+<recognition_model>'
};

type ReadPageMeasures = {
  result: OcrReadPageResult;
  assembly: OcrRegionAssembly;
};

function ComputeMsPerTile(result: OcrReadPageResult): number {
  const { decode, detection, recognition } = result.duration_ms;

  return Math.round((decode + detection + recognition) / result.tile_count);
}

// One event per page, on success and on failure (spec 0002 §14). It holds
// counts and timings only, never OCR text or image data.
function LogReadPage(
  measures: ReadPageMeasures | null,
  started_at_ms: number,
  error_code: ErrorCode | null
): void {
  const result = measures?.result ?? null;

  console.info(READ_PAGE_LOG_EVENT, {
    backend: result?.backend ?? null,
    recognizer: result?.recognizer ?? null,
    recognition_model: result?.recognition_model ?? null,
    tile_count: result?.tile_count ?? null,
    line_count: result?.lines.length ?? null,
    kept_line_count: measures?.assembly.kept_line_count ?? null,
    region_count: measures?.assembly.regions.length ?? null,
    decode_ms: result?.duration_ms.decode ?? null,
    detection_ms: result?.duration_ms.detection ?? null,
    recognition_ms: result?.duration_ms.recognition ?? null,
    ms_per_tile: result ? ComputeMsPerTile(result) : null,
    duration_ms: Math.round(performance.now() - started_at_ms),
    outcome: error_code === null ? 'succeeded' : 'failed',
    error_code
  });
}

async function ReadAndAssemble(input: {
  image_blob: Blob;
  reading_direction: ReadingDirection;
  signal: AbortSignal;
}): Promise<ReadPageMeasures> {
  // Checked before encoding, so an oversized image never becomes a string.
  if (
    ComputeBase64Length(input.image_blob.size) > MAX_OCR_IMAGE_BASE64_LENGTH
  ) {
    throw new AppError('OCR_FAILED', IMAGE_TOO_LARGE_MESSAGE);
  }

  const result = await SendOcrRequest(
    {
      target: OCR_OFFSCREEN_TARGET,
      action: 'ocr-read-page',
      image_base64: ArrayBufferToBase64(await input.image_blob.arrayBuffer()),
      mime_type: input.image_blob.type
    },
    IsOcrReadPageReply,
    input.signal
  );
  const assembly = AssembleOcrRegions({
    lines: result.lines,
    reading_direction: input.reading_direction,
    recognizer: result.recognizer
  });

  return { result, assembly };
}

export async function ReadPageWithOcr(input: {
  image_blob: Blob;
  reading_direction: ReadingDirection;
  signal: AbortSignal;
}): Promise<OcrPageReading> {
  const started_at_ms = performance.now();
  let measures: ReadPageMeasures;

  try {
    measures = await ReadAndAssemble(input);
  } catch (error) {
    LogReadPage(null, started_at_ms, ToErrorCode(error));

    throw error;
  }

  LogReadPage(measures, started_at_ms, null);

  const { result, assembly } = measures;

  return {
    width_px: result.width_px,
    height_px: result.height_px,
    source_language: assembly.source_language,
    regions: assembly.regions,
    glyph_hints: assembly.glyph_hints,
    model: `${result.detection_model}+${result.recognition_model}`
  };
}
