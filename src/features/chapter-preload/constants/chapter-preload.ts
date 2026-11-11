// Timing and limits of a next-chapter preload session (spec 0006 §7.5). The
// chapter count is a setting (spec 0006 §7.7).
export const PAGE_STABLE_MS = 3000;
export const PAGE_WAIT_TIMEOUT_MS = 30000;
export const NAVIGATION_TIMEOUT_MS = 30000;
export const RUN_TIMEOUT_MS = 600000;
export const STATUS_POLL_INTERVAL_MS = 1000;
// A tab that does not answer within this time counts as no answer, so a
// frozen tab cannot stall the session (final review finding 1).
export const TAB_MESSAGE_TIMEOUT_MS = 5000;
export const CHAPTER_PRELOAD_SESSION_KEY = 'chapter_preload_session';

// Next-chapter finder patterns (spec 0006 §5.2).
export const MAX_CONTROL_LABEL_LENGTH = 80;
export const PREVIOUS_PATTERN = /\bprev(ious)?\b|ก่อนหน้า|ย้อนกลับ/i;
export const NEXT_CHAPTER_PATTERN =
  /next\s*(chapter|ch\.?|episode|ep\.?)|ตอน(ต่อไป|ถัดไป)/i;
export const NEXT_ICON_PATTERN =
  /chevron-right|arrow-right|angle-right|caret-right/;
export const PLAIN_NEXT_PATTERN = /^(next|ถัดไป|ต่อไป)\s*[›»>→]?$/i;
