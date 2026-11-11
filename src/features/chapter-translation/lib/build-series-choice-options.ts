import type { SeriesCandidate } from '@/features/series-detection';
import { MAX_RANKED_SERIES_CHOICES } from '../constants/panel';
import { FormatMatchPercent } from './format-queue-text';

export type SeriesChoice = { series_id: string; label: string };

export function IsConfidentMatch(
  candidates: SeriesCandidate[],
  threshold: number
): boolean {
  return candidates.some(candidate => candidate.score >= threshold);
}

export function BuildSeriesChoiceOptions(
  candidates: SeriesCandidate[],
  all_series: { series_id: string; canonical_title: string }[]
): { ranked: SeriesChoice[]; others: SeriesChoice[] } {
  const ranked = [...candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RANKED_SERIES_CHOICES)
    .map(candidate => ({
      series_id: candidate.series_id,
      label: `${candidate.title} (${FormatMatchPercent(candidate.score)}%)`
    }));
  const ranked_ids = new Set(ranked.map(choice => choice.series_id));
  const others = all_series
    .filter(series => !ranked_ids.has(series.series_id))
    .sort((left, right) =>
      left.canonical_title.localeCompare(right.canonical_title)
    )
    .map(series => ({
      series_id: series.series_id,
      label: series.canonical_title
    }));

  return { ranked, others };
}
