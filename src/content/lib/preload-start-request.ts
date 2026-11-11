import type { SeriesState } from '@/features/chapter-translation';

// A start that waits for the lazy-page preload, with the chapter it is for.
export type PreloadStartRequest = {
  is_retranslation: boolean;
  bound_state: SeriesState;
  is_cache_only: boolean;
  chapter_url: string;
};

export type PreloadFollowUp =
  | { kind: 'start'; request: PreloadStartRequest }
  | { kind: 'preload'; request: PreloadStartRequest }
  | { kind: 'none' };

// Keeps one request while a preload runs. A full run wins over a cache-only
// one, and a request for another chapter replaces a stale one
// (spec 0005 §7.2).
export function MergePendingStart(
  pending: PreloadStartRequest | null,
  incoming: PreloadStartRequest
): PreloadStartRequest {
  if (!incoming.is_cache_only) return incoming;
  if (pending === null || pending.chapter_url !== incoming.chapter_url) {
    return incoming;
  }

  return pending;
}

// Decides what follows a finished preload. A pending request for the
// preloaded chapter runs without another scroll; one for the chapter the
// user moved to gets its own preload; requests for a chapter the user left
// are dropped.
export function ResolvePreloadFollowUp(input: {
  own_request: PreloadStartRequest;
  pending: PreloadStartRequest | null;
  current_chapter_url: string;
}): PreloadFollowUp {
  const { own_request, pending, current_chapter_url } = input;

  if (pending?.chapter_url === current_chapter_url) {
    return pending.chapter_url === own_request.chapter_url
      ? { kind: 'start', request: pending }
      : { kind: 'preload', request: pending };
  }

  return own_request.chapter_url === current_chapter_url
    ? { kind: 'start', request: own_request }
    : { kind: 'none' };
}
