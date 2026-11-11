import { MAX_TRACKED_PAGE_SOURCES } from '../constants/page-scanner';
import type { ScannedPage } from '../types/page-scanner';

export type IdentifiedPage = ScannedPage & { element_id: string };

/**
 * Readers recreate their image elements when the reading mode changes, so a
 * page keeps its id by image source. `pages` arrive with their element id as
 * `page_id`; the result carries the stable `page_id` and the `element_id`.
 */
export function AssignStablePageIds(
  pages: readonly ScannedPage[],
  page_ids_by_source: ReadonlyMap<string, string>,
  CreatePageId: () => string
): {
  pages: IdentifiedPage[];
  page_ids_by_source: ReadonlyMap<string, string>;
} {
  const next_page_ids_by_source = new Map(page_ids_by_source);
  const used_page_ids = new Set<string>();
  const identified_pages = pages.map(page => {
    const known_page_id = next_page_ids_by_source.get(page.effective_source);
    const page_id =
      known_page_id !== undefined && !used_page_ids.has(known_page_id)
        ? known_page_id
        : CreatePageId();

    used_page_ids.add(page_id);

    if (known_page_id === undefined) {
      next_page_ids_by_source.set(page.effective_source, page_id);
    }

    return { ...page, page_id, element_id: page.page_id };
  });

  // Map keys keep insertion order, so the first keys are the oldest sources.
  for (const source of next_page_ids_by_source.keys()) {
    if (next_page_ids_by_source.size <= MAX_TRACKED_PAGE_SOURCES) break;

    next_page_ids_by_source.delete(source);
  }

  return {
    pages: identified_pages,
    page_ids_by_source: next_page_ids_by_source
  };
}
