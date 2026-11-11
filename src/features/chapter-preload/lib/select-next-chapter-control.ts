import { ExtractChapterNumber } from '@/features/series-detection';
import {
  MAX_CONTROL_LABEL_LENGTH,
  NEXT_CHAPTER_PATTERN,
  NEXT_ICON_PATTERN,
  PLAIN_NEXT_PATTERN,
  PREVIOUS_PATTERN
} from '../constants/chapter-preload';
import type {
  ChapterControl,
  ChapterControlSnapshot,
  NextChapterSelection
} from '../types/chapter-preload';

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

function ResolveHref(raw_href: string | null, base_url: string): string | null {
  if (raw_href === null) return null;

  try {
    return new URL(raw_href, base_url).href;
  } catch {
    return null;
  }
}

export function ToChapterControl(
  snapshot: ChapterControlSnapshot,
  control_index: number,
  base_url: string
): ChapterControl {
  const label = [snapshot.aria_label, snapshot.title, snapshot.text_content]
    .filter((part): part is string => part !== null && part !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTROL_LABEL_LENGTH);

  return {
    control_index,
    tag: snapshot.tag,
    href:
      snapshot.tag === 'a' ? ResolveHref(snapshot.raw_href, base_url) : null,
    rel_tokens: snapshot.rel
      .split(/\s+/)
      .filter(token => token !== '')
      .map(token => token.toLowerCase()),
    label,
    icon_hint: [...snapshot.icon_classes, ...snapshot.image_alts]
      .join(' ')
      .toLowerCase(),
    is_disabled:
      snapshot.has_disabled_attribute || snapshot.aria_disabled === 'true',
    opens_new_tab: snapshot.target?.toLowerCase() === '_blank'
  };
}

function RemoveHash(url: string): string {
  const hash_index = url.indexOf('#');

  return hash_index === -1 ? url : url.slice(0, hash_index);
}

function IsUsableLink(href: string, current_url: URL): boolean {
  try {
    const link_url = new URL(href);

    return (
      WEB_PROTOCOLS.has(link_url.protocol) &&
      link_url.hostname === current_url.hostname &&
      RemoveHash(href) !== RemoveHash(current_url.href)
    );
  } catch {
    return false;
  }
}

function IsCandidate(control: ChapterControl, current_url: URL): boolean {
  if (control.is_disabled || control.opens_new_tab) return false;
  if (PREVIOUS_PATTERN.test(control.label)) return false;
  if (control.href !== null && !IsUsableLink(control.href, current_url)) {
    return false;
  }

  // A link whose href could not be resolved cannot be followed.
  return control.tag === 'button' || control.href !== null;
}

function ReadLinkChapterNumber(href: string): number | null {
  const chapter_number = ExtractChapterNumber(new URL(href).pathname, []);
  const value = chapter_number === null ? Number.NaN : Number(chapter_number);

  return Number.isFinite(value) ? value : null;
}

function FindNextChapterLink(
  controls: ChapterControl[],
  current_chapter_value: number
): ChapterControl | null {
  let best: { control: ChapterControl; value: number } | null = null;

  for (const control of controls) {
    if (control.href === null) continue;

    const value = ReadLinkChapterNumber(control.href);

    if (value === null || value <= current_chapter_value) continue;
    if (best === null || value < best.value) best = { control, value };
  }

  return best?.control ?? null;
}

// Picks the control that leads to the next chapter (spec 0006 §5.2). The
// arrival check after the click catches a wrong guess (§5.3).
export function SelectNextChapterControl(input: {
  controls: ChapterControl[];
  current_url: string;
  current_chapter_number: string;
}): NextChapterSelection | null {
  let current_url: URL;

  try {
    current_url = new URL(input.current_url);
  } catch {
    return null;
  }

  const candidates = input.controls.filter(control =>
    IsCandidate(control, current_url)
  );
  const Pick = (
    control: ChapterControl | undefined | null,
    rule: NextChapterSelection['rule']
  ): NextChapterSelection | null =>
    control ? { control_index: control.control_index, rule } : null;

  const rel_next = candidates.find(
    control => control.href !== null && control.rel_tokens.includes('next')
  );

  if (rel_next) return Pick(rel_next, 1);

  const labeled_next = candidates.find(control =>
    NEXT_CHAPTER_PATTERN.test(control.label)
  );

  if (labeled_next) return Pick(labeled_next, 2);

  const current_chapter_value = Number(input.current_chapter_number);

  if (Number.isFinite(current_chapter_value)) {
    const numbered_next = FindNextChapterLink(
      candidates,
      current_chapter_value
    );

    if (numbered_next) return Pick(numbered_next, 3);
  }

  const icon_next = candidates.find(
    control => control.label === '' && NEXT_ICON_PATTERN.test(control.icon_hint)
  );

  if (icon_next) return Pick(icon_next, 4);

  return Pick(
    candidates.find(control => PLAIN_NEXT_PATTERN.test(control.label)),
    5
  );
}
