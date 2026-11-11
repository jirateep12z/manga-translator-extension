import { IsRecord } from '@/lib/is-record';
import type {
  RegionAppearance,
  RegionBackdrop,
  RegionFrame,
  RegionLettering
} from '@/services/database';
import { MAX_TEXT_BOX_CANDIDATES } from '../constants/region-appearance';

const RGB_CHANNEL_COUNT = 3;
const MAX_CHANNEL_VALUE = 255;
const REGION_FRAMES: readonly RegionFrame[] = ['closed', 'open'];
const REGION_BACKDROPS: readonly RegionBackdrop[] = ['flat', 'textured'];
const REGION_LETTERINGS: readonly RegionLettering[] = [
  'text',
  'display',
  'display_large'
];

function IsRgbColor(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === RGB_CHANNEL_COUNT &&
    value.every(
      channel =>
        Number.isInteger(channel) &&
        channel >= 0 &&
        channel <= MAX_CHANNEL_VALUE
    )
  );
}

function IsPositiveFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function IsPageBox(value: unknown): boolean {
  return (
    IsRecord(value) &&
    typeof value.x_px === 'number' &&
    Number.isFinite(value.x_px) &&
    typeof value.y_px === 'number' &&
    Number.isFinite(value.y_px) &&
    IsPositiveFiniteNumber(value.width_px) &&
    IsPositiveFiniteNumber(value.height_px)
  );
}

function IsOneOf<T extends string>(
  value: unknown,
  allowed_values: readonly T[]
): boolean {
  return allowed_values.some(allowed_value => allowed_value === value);
}

// Accepts exactly the appearance values that spec 0003 §7.5 allows.
export function IsRegionAppearance(value: unknown): value is RegionAppearance {
  if (!IsRecord(value)) return false;

  const candidates = value.text_box_candidates_px;

  return (
    IsRgbColor(value.background_color) &&
    IsRgbColor(value.ink_color) &&
    IsOneOf(value.frame, REGION_FRAMES) &&
    IsOneOf(value.backdrop, REGION_BACKDROPS) &&
    IsOneOf(value.lettering, REGION_LETTERINGS) &&
    IsPositiveFiniteNumber(value.glyph_size_px) &&
    typeof value.is_vertical === 'boolean' &&
    IsPageBox(value.cover_box_px) &&
    Array.isArray(candidates) &&
    candidates.length >= 1 &&
    candidates.length <= MAX_TEXT_BOX_CANDIDATES &&
    candidates.every(IsPageBox)
  );
}
