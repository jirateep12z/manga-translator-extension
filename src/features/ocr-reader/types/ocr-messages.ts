import type { OcrReadPageResult, OcrWarmUpResult } from '@/features/ocr-engine';
import type { OCR_OFFSCREEN_TARGET } from '../constants/ocr-offscreen';

export type OcrErrorCode = 'OCR_UNAVAILABLE' | 'OCR_FAILED';

export type OcrReadPageRequest = {
  target: typeof OCR_OFFSCREEN_TARGET;
  action: 'ocr-read-page';
  image_base64: string;
  mime_type: string;
};

export type OcrWarmUpRequest = {
  target: typeof OCR_OFFSCREEN_TARGET;
  action: 'ocr-warm-up';
};

export type OcrRequest = OcrReadPageRequest | OcrWarmUpRequest;

export type OcrReply<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; error_code: OcrErrorCode; message: string };

export type OcrReadPageReply = OcrReply<OcrReadPageResult>;
export type OcrWarmUpReply = OcrReply<OcrWarmUpResult>;
