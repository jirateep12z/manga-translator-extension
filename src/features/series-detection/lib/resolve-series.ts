import { NormalizeText } from '@/lib/normalize-text';
import type { SeriesRecord, SiteBindingRecord } from '@/services/database';
import { MAX_SERIES_CANDIDATES } from '../constants/series-detection';
import type { DetectSeriesResult, PageInfo } from '../types/page-info';
import { ResolveChapterNumber } from './extract-chapter-number';
import {
  CreateSeriesMatchKeys,
  RankSeriesCandidates
} from './rank-series-candidates';

export type ResolveSeriesInput = {
  page_info: PageInfo;
  cleaned_titles: string[];
  series_list: SeriesRecord[];
  hostname_bindings: SiteBindingRecord[];
  /** The only title allowed to auto-link by exact alias. Defaults to `cleaned_titles[0]`. */
  exact_match_title?: string | null;
};

function FindPathBoundSeries(
  pathname: string,
  bindings: SiteBindingRecord[],
  series_by_id: Map<string, SeriesRecord>
): SeriesRecord | undefined {
  const matching_bindings = bindings
    .filter(
      binding =>
        binding.series_path_pattern !== null &&
        pathname.startsWith(binding.series_path_pattern)
    )
    .sort(
      (left, right) =>
        (right.series_path_pattern?.length ?? 0) -
        (left.series_path_pattern?.length ?? 0)
    );

  for (const binding of matching_bindings) {
    const series = series_by_id.get(binding.series_id);

    if (series) return series;
  }

  return undefined;
}

function FindExactAliasSeries(
  exact_match_title: string | null,
  bindings: SiteBindingRecord[],
  series_list: SeriesRecord[]
): SeriesRecord | undefined {
  const normalized_title = NormalizeText(exact_match_title ?? '');

  if (normalized_title === '') return undefined;

  const bound_series_ids = new Set(bindings.map(binding => binding.series_id));
  const matching_series = series_list.filter(
    series =>
      bound_series_ids.has(series.series_id) &&
      CreateSeriesMatchKeys(series).includes(normalized_title)
  );

  return matching_series.length === 1 ? matching_series[0] : undefined;
}

export function ResolveSeries(input: ResolveSeriesInput): DetectSeriesResult {
  const { page_info, cleaned_titles, series_list } = input;
  const chapter_number = ResolveChapterNumber(page_info);
  const bindings = input.hostname_bindings.filter(
    binding => binding.hostname === page_info.hostname
  );
  const series_by_id = new Map(
    series_list.map(series => [series.series_id, series])
  );
  const bound_series =
    FindPathBoundSeries(page_info.pathname, bindings, series_by_id) ??
    FindExactAliasSeries(
      input.exact_match_title === undefined
        ? (cleaned_titles[0] ?? null)
        : input.exact_match_title,
      bindings,
      series_list
    );

  if (bound_series) {
    return { status: 'bound', series: bound_series, chapter_number };
  }

  return {
    status: 'suggest',
    detected_title: cleaned_titles[0] ?? '',
    candidates: RankSeriesCandidates(
      cleaned_titles,
      series_list,
      MAX_SERIES_CANDIDATES
    ),
    chapter_number
  };
}
