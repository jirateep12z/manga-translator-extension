import { WaitAnimationFrames } from '@/lib/wait-animation-frames';
import { PRELOAD_FRAMES_PER_STOP } from '../constants/page-scanner';
import {
  IsScrollContainer,
  PlanPreloadScrollStops
} from '../lib/plan-preload-scroll';
import type { PageScanner } from './page-scanner.service';

export type ScrollTarget = {
  ReadScrollTopPx: () => number;
  ReadScrollHeightPx: () => number;
  ReadClientHeightPx: () => number;
  ScrollToPx: (scroll_top_px: number) => void;
};

export type WaitFrames = (frame_count: number) => Promise<void>;

// Visits every part of the scroll range so the reader inserts the page images
// it only creates near the viewport, then returns to where the user was.
export async function ScrollThroughTarget(
  scroll_target: ScrollTarget,
  WaitFrames: WaitFrames
): Promise<void> {
  const starting_scroll_top_px = scroll_target.ReadScrollTopPx();
  const stops = PlanPreloadScrollStops({
    scroll_height_px: scroll_target.ReadScrollHeightPx(),
    client_height_px: scroll_target.ReadClientHeightPx()
  });

  if (stops.length === 0) return;

  try {
    for (const scroll_top_px of stops) {
      scroll_target.ScrollToPx(scroll_top_px);
      await WaitFrames(PRELOAD_FRAMES_PER_STOP);
    }
  } finally {
    scroll_target.ScrollToPx(starting_scroll_top_px);
  }
}

// Readers such as long-strip viewers scroll an inner element instead of the
// window, so the nearest scrolling ancestor of a page is used.
function FindScrollElement(
  page_element: Element,
  document_ref: Document
): Element | null {
  const view = document_ref.defaultView;

  for (
    let element = page_element.parentElement;
    element !== null && element !== document_ref.body;
    element = element.parentElement
  ) {
    const overflow_y = view?.getComputedStyle(element).overflowY ?? '';

    if (
      IsScrollContainer({
        overflow_y,
        scroll_height_px: element.scrollHeight,
        client_height_px: element.clientHeight
      })
    ) {
      return element;
    }
  }

  return document_ref.scrollingElement;
}

function CreateElementScrollTarget(element: Element): ScrollTarget {
  return {
    ReadScrollTopPx: () => element.scrollTop,
    ReadScrollHeightPx: () => element.scrollHeight,
    ReadClientHeightPx: () => element.clientHeight,
    // An explicit instant scroll overrides `scroll-behavior: smooth`, which
    // would otherwise skip the stops in between.
    ScrollToPx: scroll_top_px =>
      element.scrollTo({ top: scroll_top_px, behavior: 'instant' })
  };
}

// Makes lazily inserted page images exist before a chapter run, then rescans
// so the run starts with them. Animation frames do not run in a hidden tab,
// so the preload is skipped there.
export async function PreloadLazyPages(
  scanner: PageScanner,
  document_ref: Document = document
): Promise<void> {
  if (document_ref.visibilityState !== 'visible') return;

  const first_page = scanner.GetPages()[0];
  const page_element = first_page
    ? scanner.GetElement(first_page.page_id)
    : null;

  if (!page_element) return;

  const scroll_element = FindScrollElement(page_element, document_ref);

  if (!scroll_element) return;

  await ScrollThroughTarget(
    CreateElementScrollTarget(scroll_element),
    WaitAnimationFrames
  );
  scanner.Rescan();
}
