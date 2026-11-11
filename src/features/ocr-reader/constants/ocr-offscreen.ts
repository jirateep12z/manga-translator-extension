// Messages and lifecycle of the offscreen document that runs the OCR engine
// (spec 0002 §5.6).
export const OCR_OFFSCREEN_TARGET = 'ocr-offscreen';
export const OCR_DOCUMENT_PATH = 'offscreen.html';
export const OCR_DOCUMENT_JUSTIFICATION = 'Runs the on-device OCR models.';
export const OCR_REQUEST_TIMEOUT_MS = 60_000;
export const OCR_IDLE_ALARM_NAME = 'ocr-idle-close';
export const OCR_IDLE_CLOSE_DELAY_MINUTES = 5;
export const MAX_OCR_IMAGE_BASE64_LENGTH = 50 * 1024 * 1024;
export const MAX_OCR_MIME_TYPE_LENGTH = 100;
