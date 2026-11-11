import { NormalizeText } from '@/lib/normalize-text';
import { TITLE_CUT_PATTERNS } from '../constants/chapter-patterns';
import { TITLE_NOISE_WORDS } from '../constants/series-detection';

const BRACKET_GROUP_PATTERN = /[[(【]([^\])】]{0,40})[\])】]/g;
const BRACKET_TOKEN_SEPARATOR_PATTERN = /[\s/,_-]+/;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2}$/;
const SECTION_SEPARATOR_PATTERN = /\s*[|•]\s*/;
const SUBTITLE_SEPARATOR_PATTERN = /\s+[-–—~]\s+/;
const TOKEN_EDGE_PUNCTUATION_PATTERN = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const FRAGMENT_EDGE_PATTERN = /^[\s\-–—|:•~,.]+|[\s\-–—|:•~,.]+$/g;

function IsBracketNoiseToken(token: string): boolean {
  return TITLE_NOISE_WORDS.has(token) || LANGUAGE_TAG_PATTERN.test(token);
}

function RemoveNoiseBrackets(text: string): string {
  return text.replace(BRACKET_GROUP_PATTERN, (group, content: string) => {
    const tokens = content
      .split(BRACKET_TOKEN_SEPARATOR_PATTERN)
      .filter(token => token !== '')
      .map(token => token.toLowerCase());

    return tokens.every(IsBracketNoiseToken) ? ' ' : group;
  });
}

function IsNoiseWord(token: string): boolean {
  return TITLE_NOISE_WORDS.has(
    token.toLowerCase().replace(TOKEN_EDGE_PUNCTUATION_PATTERN, '')
  );
}

function CutAtChapterMarker(fragment: string): string {
  let cut_index = fragment.length;

  for (const pattern of TITLE_CUT_PATTERNS) {
    const match = pattern.exec(fragment);

    if (match && match.index < cut_index) cut_index = match.index;
  }

  return fragment.slice(0, cut_index);
}

function CleanFragment(fragment: string): string {
  return CutAtChapterMarker(fragment)
    .split(/\s+/)
    .filter(token => token !== '' && !IsNoiseWord(token))
    .join(' ')
    .replace(FRAGMENT_EDGE_PATTERN, '');
}

function CreateSiteKeys(hostname: string): Set<string> {
  const labels = hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')
    .filter(label => label !== '');

  return new Set([...labels, labels.join(''), labels.slice(0, -1).join('')]);
}

/**
 * Returns the cleaned fragments of the first `|` or `•` section that has any.
 * Those separators usually set off the site name, while ` - ` and ` ~ ` inside
 * one section may also set off a subtitle such as a sequel name.
 */
function CleanPrimarySectionFragments(
  raw_title: string,
  hostname: string
): string[] {
  const text = raw_title.normalize('NFKC').replace(/\s+/g, ' ').trim();

  if (text === '') return [];

  const site_keys = CreateSiteKeys(hostname);

  for (const section of RemoveNoiseBrackets(text).split(
    SECTION_SEPARATOR_PATTERN
  )) {
    const fragments = section
      .split(SUBTITLE_SEPARATOR_PATTERN)
      .map(CleanFragment)
      .filter(
        fragment =>
          fragment !== '' &&
          !site_keys.has(NormalizeText(fragment).replace(/\s+/g, ''))
      );

    if (fragments.length > 0) return fragments;
  }

  return [];
}

export function CleanTitle(raw_title: string, hostname: string): string {
  return CleanPrimarySectionFragments(raw_title, hostname)[0] ?? '';
}

/**
 * Returns the primary cleaned title only when its section kept exactly one
 * meaningful fragment. "Solo Leveling - Ragnarok" keeps two fragments, so it
 * may name a sequel and must never auto-link.
 */
export function FindExactMatchTitle(
  title_candidates: string[],
  hostname: string
): string | null {
  for (const title_candidate of title_candidates) {
    const fragments = CleanPrimarySectionFragments(title_candidate, hostname);

    if (fragments.length === 0) continue;

    return fragments.length === 1 ? fragments[0] : null;
  }

  return null;
}

export function CleanTitleCandidates(
  title_candidates: string[],
  hostname: string
): string[] {
  const seen_titles = new Set<string>();
  const cleaned_titles: string[] = [];

  for (const title_candidate of title_candidates) {
    const cleaned_title = CleanTitle(title_candidate, hostname);
    const normalized_title = NormalizeText(cleaned_title);

    if (cleaned_title === '' || seen_titles.has(normalized_title)) continue;
    seen_titles.add(normalized_title);
    cleaned_titles.push(cleaned_title);
  }

  return cleaned_titles;
}
