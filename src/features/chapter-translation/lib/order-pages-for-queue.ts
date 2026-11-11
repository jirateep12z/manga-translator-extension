export function OrderPagesForQueue(
  page_ids: string[],
  first_visible_position: number
): { page_id: string; page_index: number }[] {
  const pages = page_ids.map((page_id, page_index) => ({
    page_id,
    page_index
  }));
  const is_in_range =
    Number.isInteger(first_visible_position) &&
    first_visible_position >= 0 &&
    first_visible_position < pages.length;
  const first_position = is_in_range ? first_visible_position : 0;

  return [...pages.slice(first_position), ...pages.slice(0, first_position)];
}
