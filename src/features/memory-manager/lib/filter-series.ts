import { NormalizeText } from '@/lib/normalize-text';
import type { SeriesRecord } from '@/services/database';

export function FilterSeries(
  series_list: SeriesRecord[],
  query: string
): SeriesRecord[] {
  const normalized_query = NormalizeText(query);

  if (normalized_query === '') return [...series_list];

  return series_list.filter(
    series =>
      NormalizeText(series.canonical_title).includes(normalized_query) ||
      series.normalized_aliases.some(alias => alias.includes(normalized_query))
  );
}
