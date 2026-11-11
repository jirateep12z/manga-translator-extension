const BYTES_PER_UNIT = 1024;
const LARGER_UNITS = ['KB', 'MB', 'GB'] as const;

export function FormatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  if (bytes < BYTES_PER_UNIT) return `${Math.round(bytes)} B`;

  let size = bytes / BYTES_PER_UNIT;
  let unit_index = 0;

  while (size >= BYTES_PER_UNIT && unit_index < LARGER_UNITS.length - 1) {
    size /= BYTES_PER_UNIT;
    unit_index++;
  }

  return `${size.toFixed(1)} ${LARGER_UNITS[unit_index]}`;
}
