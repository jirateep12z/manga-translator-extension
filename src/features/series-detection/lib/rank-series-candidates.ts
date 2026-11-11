import { NormalizeText } from '@/lib/normalize-text';
import type { SeriesRecord } from '@/services/database';
import type { SeriesCandidate } from '../types/page-info';
import { DiceSimilarity } from './dice-similarity';

export function CreateSeriesMatchKeys(series: SeriesRecord): string[] {
  return [
    ...new Set([
      NormalizeText(series.canonical_title),
      ...series.normalized_aliases
    ])
  ].filter(key => key !== '');
}

function ScoreSeries(
  normalized_titles: string[],
  series: SeriesRecord
): number {
  let best_score = 0;

  for (const key of CreateSeriesMatchKeys(series)) {
    for (const title of normalized_titles) {
      best_score = Math.max(best_score, DiceSimilarity(title, key));
    }
  }

  return best_score;
}

export function RankSeriesCandidates(
  cleaned_titles: string[],
  series_list: SeriesRecord[],
  limit: number
): SeriesCandidate[] {
  const normalized_titles = cleaned_titles
    .map(NormalizeText)
    .filter(title => title !== '');

  return series_list
    .map(series => ({
      series_id: series.series_id,
      title: series.canonical_title,
      score: ScoreSeries(normalized_titles, series)
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.title.localeCompare(right.title)
    )
    .slice(0, Math.max(0, limit));
}
