import { IsRecord } from '@/lib/is-record';
import type { RegionKind, SourceLanguage } from '@/services/database';
import { NORMALIZED_BOX_MAX } from '../constants/pipeline';
import type {
  ImageReadingResponse,
  NormalizedBox,
  NormalizedRegion,
  ValidationResult
} from '../types/pipeline';

const SOURCE_LANGUAGES: ReadonlySet<string> = new Set([
  'ja',
  'ko',
  'zh',
  'en',
  'other'
]);
const REGION_KINDS: ReadonlySet<string> = new Set([
  'speech',
  'narration',
  'sfx'
]);
const BOX_COORDINATE_COUNT = 4;

function ClampCoordinate(value: number): number {
  return Math.min(NORMALIZED_BOX_MAX, Math.max(0, value));
}

function ReadBox(value: unknown): NormalizedBox | null {
  const is_box =
    Array.isArray(value) &&
    value.length === BOX_COORDINATE_COUNT &&
    value.every(
      coordinate =>
        typeof coordinate === 'number' && Number.isFinite(coordinate)
    );

  if (!is_box) return null;

  const [x_min, y_min, x_max, y_max] = (value as number[]).map(ClampCoordinate);

  return x_max > x_min && y_max > y_min ? [x_min, y_min, x_max, y_max] : null;
}

function ReadRegion(value: unknown): NormalizedRegion | null {
  if (!IsRecord(value)) return null;

  const bbox = ReadBox(value.bbox);
  const source_text =
    typeof value.source_text === 'string' ? value.source_text.trim() : '';
  const is_valid_kind =
    typeof value.kind === 'string' && REGION_KINDS.has(value.kind);

  if (!bbox || source_text === '' || !is_valid_kind) return null;

  return { bbox, source_text, kind: value.kind as RegionKind };
}

export function ValidateImageReadingResponse(
  raw: unknown
): ValidationResult<ImageReadingResponse> {
  if (!IsRecord(raw)) {
    return { is_valid: false, error: 'Response must be a JSON object.' };
  }

  if (!Array.isArray(raw.regions)) {
    return { is_valid: false, error: '"regions" must be an array.' };
  }

  const source_language =
    typeof raw.source_language === 'string' &&
    SOURCE_LANGUAGES.has(raw.source_language)
      ? (raw.source_language as SourceLanguage)
      : 'other';

  return {
    is_valid: true,
    value: {
      source_language,
      regions: raw.regions
        .map(ReadRegion)
        .filter((region): region is NormalizedRegion => region !== null)
    }
  };
}
