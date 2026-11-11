import { NormalizeText } from '@/lib/normalize-text';
import type { SeriesRecord } from '@/services/database';
import { SERIES_MATCH_THRESHOLD } from '../constants/series-detection';
import { DiceSimilarity } from './dice-similarity';
import {
  FindChapterSegment,
  IsUsableSeriesSegment,
  SplitPathSegments
} from './path-segments';
import { CreateSeriesMatchKeys } from './rank-series-candidates';

export function DeriveSeriesPathPattern(pathname: string): string | null {
  const { raw_segments, decoded_segments } = SplitPathSegments(pathname);
  const match = FindChapterSegment(decoded_segments);

  if (!match || match.index === 0) return null;
  if (!decoded_segments.slice(0, match.index).some(IsUsableSeriesSegment)) {
    return null;
  }

  return `/${raw_segments.slice(0, match.index).join('/')}/`;
}

const MIN_SEGMENTS_BEFORE_NUMERIC_CHAPTER = 2;

function ToSlugTitle(decoded_segment: string): string {
  return decoded_segment.replace(/[-_+]+/g, ' ').trim();
}

/**
 * A pattern is stored only when its last segment names the confirmed series,
 * so section prefixes such as `/reader/` never capture a whole website.
 */
export function DeriveConfirmedSeriesPathPattern(
  pathname: string,
  series: SeriesRecord
): string | null {
  const series_path_pattern = DeriveSeriesPathPattern(pathname);

  if (series_path_pattern === null) return null;

  const chapter_match = FindChapterSegment(
    SplitPathSegments(pathname).decoded_segments
  );
  const is_numeric_only_chapter = chapter_match?.chapter_number === null;

  // A bare number may be a series or page ID, so one segment before it may be
  // a section such as `/reader/` whose slug the page title can also repeat.
  if (
    is_numeric_only_chapter &&
    (chapter_match?.index ?? 0) < MIN_SEGMENTS_BEFORE_NUMERIC_CHAPTER
  ) {
    return null;
  }

  const decoded_segments =
    SplitPathSegments(series_path_pattern).decoded_segments;
  const slug_title = NormalizeText(
    ToSlugTitle(decoded_segments[decoded_segments.length - 1] ?? '')
  );
  const is_series_slug = CreateSeriesMatchKeys(series).some(
    key => DiceSimilarity(slug_title, key) >= SERIES_MATCH_THRESHOLD
  );

  return is_series_slug ? series_path_pattern : null;
}

export function ExtractUrlSlugTitle(pathname: string): string | null {
  const { decoded_segments } = SplitPathSegments(pathname);
  const search_end =
    FindChapterSegment(decoded_segments)?.index ?? decoded_segments.length;

  for (let index = search_end - 1; index >= 0; index--) {
    const segment = decoded_segments[index];

    if (IsUsableSeriesSegment(segment)) {
      return ToSlugTitle(segment);
    }
  }

  return null;
}
