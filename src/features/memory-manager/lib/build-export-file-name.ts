function PadTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

// The UTC date keeps the name stable regardless of the user's time zone.
export function BuildExportFileName(date: Date): string {
  const date_stamp = `${date.getUTCFullYear()}${PadTwoDigits(date.getUTCMonth() + 1)}${PadTwoDigits(date.getUTCDate())}`;

  return `manga-translator-memory-${date_stamp}.json`;
}
