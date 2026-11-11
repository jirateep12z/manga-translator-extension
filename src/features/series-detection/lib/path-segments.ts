import {
  CHAPTER_MARKER_WORD_PATTERN,
  LOCALIZED_CHAPTER_PATTERNS,
  NUMERIC_SEGMENT_PATTERN,
  URL_CHAPTER_SEGMENT_PATTERN
} from '../constants/chapter-patterns';
import {
  GENERIC_PATH_SEGMENTS,
  MIN_USABLE_SEGMENT_LENGTH
} from '../constants/series-detection';
import { NormalizeChapterNumber } from './normalize-chapter-number';

export type PathSegments = {
  raw_segments: string[];
  decoded_segments: string[];
};

export type ChapterSegmentMatch = {
  index: number;
  chapter_number: string | null;
};

function DecodeSegment(raw_segment: string): string {
  try {
    return decodeURIComponent(raw_segment).normalize('NFKC');
  } catch {
    return raw_segment.normalize('NFKC');
  }
}

export function SplitPathSegments(pathname: string): PathSegments {
  const raw_segments = pathname.split('/').filter(segment => segment !== '');

  return { raw_segments, decoded_segments: raw_segments.map(DecodeSegment) };
}

function MatchChapterInSegment(segment: string): string | null {
  for (const pattern of [
    URL_CHAPTER_SEGMENT_PATTERN,
    ...LOCALIZED_CHAPTER_PATTERNS
  ]) {
    const match = pattern.exec(segment);

    if (match) return NormalizeChapterNumber(match[1], match[2]);
  }

  return null;
}

export function FindChapterSegment(
  decoded_segments: string[]
): ChapterSegmentMatch | null {
  for (const [index, segment] of decoded_segments.entries()) {
    const chapter_number = MatchChapterInSegment(segment);

    if (chapter_number !== null) return { index, chapter_number };

    const next_match =
      CHAPTER_MARKER_WORD_PATTERN.test(segment) &&
      index + 1 < decoded_segments.length
        ? NUMERIC_SEGMENT_PATTERN.exec(decoded_segments[index + 1])
        : null;

    if (next_match) {
      return {
        index,
        chapter_number: NormalizeChapterNumber(next_match[1], next_match[2])
      };
    }
  }

  const last_index = decoded_segments.length - 1;

  if (
    last_index >= 0 &&
    NUMERIC_SEGMENT_PATTERN.test(decoded_segments[last_index])
  ) {
    return { index: last_index, chapter_number: null };
  }

  return null;
}

export function IsUsableSeriesSegment(decoded_segment: string): boolean {
  return (
    !GENERIC_PATH_SEGMENTS.has(decoded_segment.toLowerCase()) &&
    !/^\d+$/.test(decoded_segment) &&
    Array.from(decoded_segment).length >= MIN_USABLE_SEGMENT_LENGTH &&
    /\p{L}/u.test(decoded_segment)
  );
}
