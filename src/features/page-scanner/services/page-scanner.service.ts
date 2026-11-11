import {
  EXCLUDED_ANCESTOR_SELECTOR,
  LAZY_SOURCE_ATTRIBUTES
} from '../constants/page-scanner';
import { AssignStablePageIds } from '../lib/assign-stable-page-ids';
import { ResolveRescanDelayMs } from '../lib/resolve-rescan-delay';
import { SelectMangaPages } from '../lib/select-manga-pages';
import type { ImageSnapshot, ScannedPage } from '../types/page-scanner';

export type PageScanner = {
  Start: () => void;
  Stop: () => void;
  Rescan: () => void;
  GetPages: () => readonly ScannedPage[];
  GetElement: (page_id: string) => HTMLImageElement | null;
  Subscribe: (OnChange: () => void) => () => void;
};

const OBSERVED_ATTRIBUTES = ['src', 'srcset', ...LAZY_SOURCE_ATTRIBUTES];

function ReadPositiveIntegerAttribute(
  image: HTMLImageElement,
  attribute_name: string
): number | null {
  const value = Number.parseInt(image.getAttribute(attribute_name) ?? '', 10);

  return Number.isFinite(value) && value > 0 ? value : null;
}

function ResolveLazyValue(
  image: HTMLImageElement,
  attribute_name: string,
  base_uri: string
): string {
  const value = image.getAttribute(attribute_name);

  if (!value) return '';

  try {
    return new URL(value, base_uri).href;
  } catch {
    return '';
  }
}

export function CreatePageScanner(
  document_ref: Document = document
): PageScanner {
  const element_ids = new WeakMap<HTMLImageElement, string>();
  const subscribers = new Set<() => void>();
  let element_counter = 0;
  let page_counter = 0;
  let page_ids_by_source: ReadonlyMap<string, string> = new Map();
  let elements_by_id = new Map<string, HTMLImageElement>();
  let pages: readonly ScannedPage[] = [];
  let pages_signature = '';
  let observer: MutationObserver | null = null;
  let rescan_timer_id: ReturnType<typeof setTimeout> | null = null;
  let rescan_pending_since_ms: number | null = null;

  function ReadElementId(image: HTMLImageElement): string {
    const existing_id = element_ids.get(image);

    if (existing_id) return existing_id;

    element_counter++;

    const element_id = `element-${element_counter}`;

    element_ids.set(image, element_id);

    return element_id;
  }

  function CreateSnapshot(
    image: HTMLImageElement,
    document_order: number
  ): ImageSnapshot {
    const rect = image.getBoundingClientRect();

    return {
      element_id: ReadElementId(image),
      current_src: image.currentSrc,
      src_attribute: image.getAttribute('src') ?? '',
      lazy_attribute_values: LAZY_SOURCE_ATTRIBUTES.map(attribute_name =>
        ResolveLazyValue(image, attribute_name, document_ref.baseURI)
      ),
      is_loaded: image.complete && image.naturalWidth > 0,
      natural_width_px: image.naturalWidth,
      natural_height_px: image.naturalHeight,
      attribute_width_px: ReadPositiveIntegerAttribute(image, 'width'),
      attribute_height_px: ReadPositiveIntegerAttribute(image, 'height'),
      rendered_width_px: rect.width,
      rendered_height_px: rect.height,
      document_order,
      is_in_excluded_ancestor:
        image.closest(EXCLUDED_ANCESTOR_SELECTOR) !== null
    };
  }

  function CreatePageId(): string {
    page_counter++;

    return `page-${page_counter}`;
  }

  function Rescan(): void {
    const images = Array.from(document_ref.querySelectorAll('img'));
    const snapshots = images.map(CreateSnapshot);
    const selection = SelectMangaPages(snapshots);
    const assignment = AssignStablePageIds(
      selection.pages,
      page_ids_by_source,
      CreatePageId
    );
    const elements_by_element_id = new Map(
      images.map((image, index) => [snapshots[index].element_id, image])
    );
    // The element id is part of the signature, so subscribers re-render when
    // the reader swaps a page's element and overlays follow the new one.
    const next_signature = assignment.pages
      .map(
        page => `${page.page_id}\n${page.element_id}\n${page.effective_source}`
      )
      .join('\n\n');

    page_ids_by_source = assignment.page_ids_by_source;
    elements_by_id = new Map(
      assignment.pages.flatMap(page => {
        const element = elements_by_element_id.get(page.element_id);

        return element ? [[page.page_id, element] as const] : [];
      })
    );

    if (next_signature === pages_signature) return;

    pages_signature = next_signature;
    pages = assignment.pages.map(
      ({ element_id: _element_id, ...page }) => page
    );

    for (const OnChange of subscribers) OnChange();
  }

  function ScheduleRescan(): void {
    const now_ms = Date.now();

    if (rescan_timer_id !== null) clearTimeout(rescan_timer_id);

    rescan_pending_since_ms ??= now_ms;
    rescan_timer_id = setTimeout(
      () => {
        rescan_timer_id = null;
        rescan_pending_since_ms = null;
        Rescan();
      },
      ResolveRescanDelayMs(rescan_pending_since_ms, now_ms)
    );
  }

  function HandleLoad(event: Event): void {
    if (event.target instanceof HTMLImageElement) ScheduleRescan();
  }

  return {
    Start: () => {
      Rescan();
      observer?.disconnect();
      observer = new MutationObserver(ScheduleRescan);
      observer.observe(document_ref.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES
      });
      document_ref.addEventListener('load', HandleLoad, { capture: true });
    },
    Stop: () => {
      observer?.disconnect();
      observer = null;
      document_ref.removeEventListener('load', HandleLoad, { capture: true });

      if (rescan_timer_id !== null) {
        clearTimeout(rescan_timer_id);
        rescan_timer_id = null;
      }

      rescan_pending_since_ms = null;
    },
    Rescan,
    GetPages: () => pages,
    GetElement: page_id => elements_by_id.get(page_id) ?? null,
    Subscribe: OnChange => {
      subscribers.add(OnChange);

      return () => subscribers.delete(OnChange);
    }
  };
}
