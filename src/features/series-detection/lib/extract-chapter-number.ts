import { TITLE_CHAPTER_PATTERNS } from '../constants/chapter-patterns';
import { MAX_INCOMING_URL_LENGTH } from '../constants/series-detection';
import type { PageInfo } from '../types/page-info';
import { NormalizeChapterNumber } from './normalize-chapter-number';
import { FindChapterSegment, SplitPathSegments } from './path-segments';

const URL_CHAPTER_PREFIX = 'url:';

function ExtractTitleChapterNumber(title_candidates: string[]): string | null {
  for (const title of title_candidates) {
    const normalized_title = title.normalize('NFKC');

    for (const pattern of TITLE_CHAPTER_PATTERNS) {
      const match = pattern.exec(normalized_title);

      if (match) return NormalizeChapterNumber(match[1], match[2]);
    }
  }

  return null;
}

export function ExtractChapterNumber(
  pathname: string,
  title_candidates: string[]
): string | null {
  const segment_match = FindChapterSegment(
    SplitPathSegments(pathname).decoded_segments
  );

  return (
    segment_match?.chapter_number ?? ExtractTitleChapterNumber(title_candidates)
  );
}

/** Falls back to `url:<pathname>`, capped so the stored key stays importable. */
export function ResolveChapterNumber(
  page_info: Pick<PageInfo, 'chapter_number' | 'pathname'>
): string {
  if (page_info.chapter_number !== null) return page_info.chapter_number;

  return Array.from(`${URL_CHAPTER_PREFIX}${page_info.pathname}`)
    .slice(0, MAX_INCOMING_URL_LENGTH)
    .join('');
}
