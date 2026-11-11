import type { OcrBackend, OcrRecognizer } from '@/features/ocr-engine';
import { IsRecord } from '@/lib/is-record';
import {
  MAX_OCR_IMAGE_BASE64_LENGTH,
  MAX_OCR_MIME_TYPE_LENGTH,
  OCR_OFFSCREEN_TARGET
} from '../constants/ocr-offscreen';
import type {
  OcrErrorCode,
  OcrReadPageReply,
  OcrRequest,
  OcrWarmUpReply
} from '../types/ocr-messages';

const OCR_BACKENDS: ReadonlySet<string> = new Set<OcrBackend>([
  'webgpu',
  'wasm'
]);
const OCR_RECOGNIZERS: ReadonlySet<string> = new Set<OcrRecognizer>([
  'general',
  'korean'
]);
const OCR_ERROR_CODES: ReadonlySet<string> = new Set<OcrErrorCode>([
  'OCR_UNAVAILABLE',
  'OCR_FAILED'
]);
const MIN_TILE_COUNT = 1;

function IsFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function IsKnownValue(
  value: unknown,
  known_values: ReadonlySet<string>
): boolean {
  return typeof value === 'string' && known_values.has(value);
}

function IsTextWithin(value: unknown, max_length: number): boolean {
  return typeof value === 'string' && value.length <= max_length;
}

function IsAddressedToOcr(
  message: unknown
): message is Record<string, unknown> {
  return IsRecord(message) && message.target === OCR_OFFSCREEN_TARGET;
}

function IsBboxPx(value: unknown): boolean {
  return (
    IsRecord(value) &&
    IsFiniteNumber(value.x_px) &&
    IsFiniteNumber(value.y_px) &&
    IsFiniteNumber(value.width_px) &&
    IsFiniteNumber(value.height_px)
  );
}

function IsOcrLine(value: unknown): boolean {
  return (
    IsRecord(value) &&
    IsBboxPx(value.bbox_px) &&
    typeof value.text === 'string' &&
    IsFiniteNumber(value.score) &&
    typeof value.is_vertical === 'boolean'
  );
}

function IsReadPageDurations(value: unknown): boolean {
  return (
    IsRecord(value) &&
    IsFiniteNumber(value.decode) &&
    IsFiniteNumber(value.detection) &&
    IsFiniteNumber(value.recognition)
  );
}

// A tile count of at least 1 keeps the per-tile time defined (spec 0002 §14).
function IsReadPageResult(value: unknown): boolean {
  return (
    IsRecord(value) &&
    IsFiniteNumber(value.width_px) &&
    value.width_px > 0 &&
    IsFiniteNumber(value.height_px) &&
    value.height_px > 0 &&
    IsKnownValue(value.backend, OCR_BACKENDS) &&
    typeof value.detection_model === 'string' &&
    IsKnownValue(value.recognizer, OCR_RECOGNIZERS) &&
    typeof value.recognition_model === 'string' &&
    IsFiniteNumber(value.tile_count) &&
    Number.isInteger(value.tile_count) &&
    value.tile_count >= MIN_TILE_COUNT &&
    Array.isArray(value.lines) &&
    value.lines.every(IsOcrLine) &&
    IsReadPageDurations(value.duration_ms)
  );
}

function IsWarmUpResult(value: unknown): boolean {
  return IsRecord(value) && IsKnownValue(value.backend, OCR_BACKENDS);
}

function IsReplyOf(
  reply: unknown,
  IsResult: (result: unknown) => boolean
): boolean {
  if (!IsRecord(reply)) return false;

  if (reply.ok === true) return IsResult(reply.result);

  return (
    reply.ok === false &&
    IsOcrErrorCode(reply.error_code) &&
    typeof reply.message === 'string'
  );
}

export function IsOcrErrorCode(value: unknown): value is OcrErrorCode {
  return IsKnownValue(value, OCR_ERROR_CODES);
}

export function IsOcrOffscreenMessage(message: unknown): boolean {
  return IsAddressedToOcr(message);
}

export function IsOcrRequest(message: unknown): message is OcrRequest {
  if (!IsAddressedToOcr(message)) return false;

  if (message.action === 'ocr-warm-up') return true;

  return (
    message.action === 'ocr-read-page' &&
    IsTextWithin(message.image_base64, MAX_OCR_IMAGE_BASE64_LENGTH) &&
    IsTextWithin(message.mime_type, MAX_OCR_MIME_TYPE_LENGTH)
  );
}

export function IsOcrReadPageReply(reply: unknown): reply is OcrReadPageReply {
  return IsReplyOf(reply, IsReadPageResult);
}

export function IsOcrWarmUpReply(reply: unknown): reply is OcrWarmUpReply {
  return IsReplyOf(reply, IsWarmUpResult);
}
