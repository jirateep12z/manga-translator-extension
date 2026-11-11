import { IsRegionAppearance } from '@/features/region-appearance';
import { VALID_TARGET_LANGUAGES } from '@/features/settings';
import { IsRecord } from '@/lib/is-record';
import type { ChapterPortResponse } from '../types/port-messages';

const PAGE_OUTCOMES: ReadonlySet<string> = new Set([
  'translated',
  'translated_with_warnings',
  'no_text',
  'already_in_target_language'
]);
const REGION_KINDS: ReadonlySet<string> = new Set([
  'speech',
  'narration',
  'sfx'
]);

function IsFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

function IsRenderedRegion(value: unknown): boolean {
  return (
    IsRecord(value) &&
    typeof value.region_id === 'string' &&
    IsBboxPx(value.bbox_px) &&
    typeof value.kind === 'string' &&
    REGION_KINDS.has(value.kind) &&
    typeof value.source_text === 'string' &&
    (typeof value.translated_text === 'string' ||
      value.translated_text === null) &&
    // A missing appearance is undefined and fails (spec 0003 §7.5).
    (value.appearance === null || IsRegionAppearance(value.appearance))
  );
}

function IsPageResult(value: Record<string, unknown>): boolean {
  return (
    IsFiniteNumber(value.page_index) &&
    IsFiniteNumber(value.image_width_px) &&
    IsFiniteNumber(value.image_height_px) &&
    typeof value.outcome === 'string' &&
    PAGE_OUTCOMES.has(value.outcome) &&
    typeof value.source_language === 'string' &&
    typeof value.target_language === 'string' &&
    VALID_TARGET_LANGUAGES.has(value.target_language) &&
    Array.isArray(value.regions) &&
    value.regions.every(IsRenderedRegion)
  );
}

export function IsChapterPortResponse(
  value: unknown
): value is ChapterPortResponse {
  if (!IsRecord(value)) return false;

  switch (value.action) {
    case 'page-result':
      return IsPageResult(value);
    case 'page-error':
      return (
        IsFiniteNumber(value.page_index) && typeof value.error_code === 'string'
      );
    case 'capture-done':
      return IsFiniteNumber(value.page_index);
    case 'warm-up-done':
      return true;
    case 'chapter-finalized':
      return typeof value.was_summarized === 'boolean';
    default:
      return false;
  }
}
