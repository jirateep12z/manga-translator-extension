import {
  MAX_INCOMING_TITLE_LENGTH,
  MAX_INCOMING_URL_LENGTH,
  MAX_PAGE_CHAPTER_NUMBER_LENGTH,
  MAX_TITLE_CANDIDATE_LENGTH,
  MAX_TITLE_CANDIDATES
} from '../constants/series-detection';
import type { PageInfo } from '../types/page-info';
import { ExtractChapterNumber } from './extract-chapter-number';
import { ExtractJsonLdNames } from './json-ld-names';
import { ExtractUrlSlugTitle } from './series-path-pattern';

export type PageSourceTexts = {
  hostname: string;
  href: string;
  pathname: string;
  json_ld_texts: string[];
  og_title: string | null;
  breadcrumb_texts: string[];
  h1_text: string | null;
  document_title: string;
};

function CollectTitleCandidates(source_texts: PageSourceTexts): string[] {
  const raw_candidates = [
    ...ExtractJsonLdNames(source_texts.json_ld_texts),
    source_texts.og_title,
    ...[...source_texts.breadcrumb_texts].reverse(),
    source_texts.h1_text,
    source_texts.document_title,
    ExtractUrlSlugTitle(source_texts.pathname)
  ];
  const title_candidates = raw_candidates
    .filter((candidate): candidate is string => candidate !== null)
    .map(candidate => candidate.replace(/\s+/g, ' ').trim())
    .filter(candidate => candidate !== '')
    .map(TruncateTitleCandidate);

  return [...new Set(title_candidates)].slice(0, MAX_TITLE_CANDIDATES);
}

/** Caps code points like the plan, and UTF-16 units like the background guard. */
function TruncateTitleCandidate(candidate: string): string {
  const code_points = Array.from(candidate).slice(
    0,
    MAX_TITLE_CANDIDATE_LENGTH
  );

  while (code_points.join('').length > MAX_INCOMING_TITLE_LENGTH) {
    code_points.pop();
  }

  return code_points.join('');
}

function CapPageUrl(href: string): string {
  if (href.length <= MAX_INCOMING_URL_LENGTH) return href;

  return href.split(/[?#]/)[0].slice(0, MAX_INCOMING_URL_LENGTH);
}

export function BuildPageInfo(source_texts: PageSourceTexts): PageInfo {
  const title_candidates = CollectTitleCandidates(source_texts);
  const pathname = source_texts.pathname.slice(0, MAX_INCOMING_URL_LENGTH);
  const chapter_number = ExtractChapterNumber(pathname, title_candidates);

  return {
    hostname: source_texts.hostname.toLowerCase(),
    url: CapPageUrl(source_texts.href),
    pathname,
    title_candidates,
    chapter_number:
      chapter_number !== null &&
      chapter_number.length <= MAX_PAGE_CHAPTER_NUMBER_LENGTH
        ? chapter_number
        : null
  };
}
