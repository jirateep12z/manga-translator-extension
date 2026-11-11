import { MIN_MANGA_IMAGES_FOR_PANEL } from '@/features/page-scanner';

/**
 * Single-page readers show one manga image at a time, so a page with a known
 * chapter number and at least one page also shows the panel.
 */
export function ResolvePanelVisibility(input: {
  is_enabled: boolean;
  page_count: number;
  is_series_bound: boolean;
  has_chapter_number: boolean;
}): boolean {
  const is_single_page_chapter =
    input.has_chapter_number && input.page_count > 0;

  return (
    input.is_enabled &&
    (input.page_count >= MIN_MANGA_IMAGES_FOR_PANEL ||
      input.is_series_bound ||
      is_single_page_chapter)
  );
}
