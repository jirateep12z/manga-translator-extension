const PAGE_NUMBER_SEGMENT_PATTERN = /^\d+$/;

type PageTurnInput = {
  previous_url: string;
  next_url: string;
  previous_chapter_number: string | null;
  next_chapter_number: string | null;
};

function ParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function SplitSegments(pathname: string): string[] {
  return pathname.split('/').filter(segment => segment !== '');
}

// Some readers put the page number in the path (for example MangaDex's
// /chapter/<id>/<page>) and change it while the user scrolls. That is a page
// turn, not a new chapter, when only the trailing number changes and the
// chapter number is known and unchanged.
export function IsPageTurnWithinChapter(input: PageTurnInput): boolean {
  const { previous_chapter_number, next_chapter_number } = input;

  if (
    previous_chapter_number === null ||
    previous_chapter_number !== next_chapter_number
  ) {
    return false;
  }

  const previous_url = ParseUrl(input.previous_url);
  const next_url = ParseUrl(input.next_url);

  if (
    !previous_url ||
    !next_url ||
    previous_url.origin !== next_url.origin ||
    previous_url.search !== next_url.search
  ) {
    return false;
  }

  const previous_segments = SplitSegments(previous_url.pathname);
  const next_segments = SplitSegments(next_url.pathname);
  const last_index = previous_segments.length - 1;

  if (last_index < 1 || next_segments.length !== previous_segments.length) {
    return false;
  }

  const is_same_prefix = previous_segments
    .slice(0, last_index)
    .every((segment, index) => segment === next_segments[index]);

  return (
    is_same_prefix &&
    PAGE_NUMBER_SEGMENT_PATTERN.test(previous_segments[last_index]) &&
    PAGE_NUMBER_SEGMENT_PATTERN.test(next_segments[last_index])
  );
}
