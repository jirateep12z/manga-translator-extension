import {
  AddSeriesAlias,
  CreateSeries,
  DeleteSiteBinding,
  FindChapterNumberBySourceUrl,
  ListBindingsByHostname,
  ListSeries,
  ReadSeries,
  RecordChapterSourceUrl,
  UpsertSiteBinding
} from '@/features/memory';
import { NormalizeText } from '@/lib/normalize-text';
import type { SeriesRecord } from '@/services/database';
import {
  CleanTitle,
  CleanTitleCandidates,
  FindExactMatchTitle
} from '../lib/clean-title';
import { CreateSeriesMatchKeys } from '../lib/rank-series-candidates';
import { ResolveSeries } from '../lib/resolve-series';
import { DeriveConfirmedSeriesPathPattern } from '../lib/series-path-pattern';
import type {
  ConfirmSeriesMessage,
  ListSeriesResponse
} from '../types/message';
import type { DetectSeriesResult, PageInfo } from '../types/page-info';

export class SeriesNotFoundError extends Error {
  constructor(series_id: string) {
    super(`Series not found: ${series_id}`);
    this.name = 'SeriesNotFoundError';
  }
}

export async function DetectSeries(
  page_info: PageInfo
): Promise<DetectSeriesResult> {
  const [series_list, hostname_bindings] = await Promise.all([
    ListSeries(),
    ListBindingsByHostname(page_info.hostname)
  ]);

  const result = ResolveSeries({
    page_info,
    cleaned_titles: CleanTitleCandidates(
      page_info.title_candidates,
      page_info.hostname
    ),
    series_list,
    hostname_bindings,
    exact_match_title: FindExactMatchTitle(
      page_info.title_candidates,
      page_info.hostname
    )
  });

  if (result.status !== 'bound') return result;

  // A chapter number the user confirmed for this page wins over detection.
  const confirmed_chapter_number = await FindChapterNumberBySourceUrl(
    result.series.series_id,
    page_info.url
  );

  return confirmed_chapter_number === null
    ? result
    : { ...result, chapter_number: confirmed_chapter_number };
}

async function ResolveConfirmedSeries(
  message: ConfirmSeriesMessage,
  cleaned_detected_title: string
): Promise<SeriesRecord> {
  if (message.series_id !== undefined) {
    const series = await ReadSeries(message.series_id);

    if (!series) throw new SeriesNotFoundError(message.series_id);

    return series;
  }

  return CreateSeries({
    canonical_title: (message.new_title ?? '').trim(),
    detected_title: cleaned_detected_title
  });
}

export async function ConfirmSeries(
  message: ConfirmSeriesMessage
): Promise<SeriesRecord> {
  const { page_info } = message;
  const cleaned_detected_title = CleanTitle(
    message.detected_title,
    page_info.hostname
  );
  const resolved_series = await ResolveConfirmedSeries(
    message,
    cleaned_detected_title
  );
  const normalized_title = NormalizeText(cleaned_detected_title);
  const should_add_alias =
    normalized_title !== '' &&
    !resolved_series.normalized_aliases.includes(normalized_title);
  const final_series = should_add_alias
    ? await AddSeriesAlias(resolved_series.series_id, cleaned_detected_title)
    : resolved_series;

  const series_path_pattern = DeriveConfirmedSeriesPathPattern(
    page_info.pathname,
    final_series
  );

  await UpsertSiteBinding({
    hostname: page_info.hostname,
    series_path_pattern,
    series_id: final_series.series_id
  });

  if (series_path_pattern === null) {
    await RevokeConflictingHostnameBindings(
      page_info.hostname,
      final_series.series_id,
      normalized_title
    );
  }

  const confirmed_chapter_number = message.chapter_number.trim();

  if (confirmed_chapter_number !== '') {
    await RecordChapterSourceUrl({
      series_id: final_series.series_id,
      chapter_number: confirmed_chapter_number,
      page_url: page_info.url
    });
  }

  return final_series;
}

/**
 * The user's latest confirmation wins: another series bound to the same
 * hostname with the same title would make every later exact match ambiguous.
 */
async function RevokeConflictingHostnameBindings(
  hostname: string,
  confirmed_series_id: string,
  normalized_title: string
): Promise<void> {
  if (normalized_title === '') return;

  const hostname_bindings = await ListBindingsByHostname(hostname);
  const other_hostname_bindings = hostname_bindings.filter(
    binding =>
      binding.series_path_pattern === null &&
      binding.series_id !== confirmed_series_id
  );

  for (const binding of other_hostname_bindings) {
    const series = await ReadSeries(binding.series_id);
    const has_same_title =
      series !== undefined &&
      CreateSeriesMatchKeys(series).includes(normalized_title);

    if (has_same_title) await DeleteSiteBinding(binding.binding_id);
  }
}

export async function ListSeriesSummaries(): Promise<
  ListSeriesResponse['series']
> {
  const series_list = await ListSeries();

  return series_list.map(series => ({
    series_id: series.series_id,
    canonical_title: series.canonical_title
  }));
}
