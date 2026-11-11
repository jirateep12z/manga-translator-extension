import type { PaperFill } from './flood-paper';

// Marks the window's non-paper pixels that connect to the window's edge
// through 8-connected non-paper pixels: the outline and what lies beyond it.
// The remaining non-paper pixels are ink that the bubble encloses
// (spec 0003 §6.7, step 1). One byte for each window pixel, in window
// row-major order, set to 1 for outside pixels.
export function LabelOutsidePixels(fill: PaperFill): Uint8Array {
  const { window, filled } = fill;
  const window_width_px = window.right_px - window.left_px;
  const window_height_px = window.bottom_px - window.top_px;
  const outside = new Uint8Array(window_width_px * window_height_px);
  const pending_pixels: number[] = [];

  function MarkIfNonPaper(column: number, row: number): void {
    const window_index = row * window_width_px + column;

    if (filled[window_index] === 1 || outside[window_index] === 1) return;

    outside[window_index] = 1;
    pending_pixels.push(window_index);
  }

  for (let column = 0; column < window_width_px; column++) {
    MarkIfNonPaper(column, 0);
    MarkIfNonPaper(column, window_height_px - 1);
  }

  for (let row = 0; row < window_height_px; row++) {
    MarkIfNonPaper(0, row);
    MarkIfNonPaper(window_width_px - 1, row);
  }

  for (
    let window_index = pending_pixels.pop();
    window_index !== undefined;
    window_index = pending_pixels.pop()
  ) {
    const column = window_index % window_width_px;
    const row = (window_index - column) / window_width_px;

    for (let row_offset = -1; row_offset <= 1; row_offset++) {
      for (let column_offset = -1; column_offset <= 1; column_offset++) {
        const neighbor_column = column + column_offset;
        const neighbor_row = row + row_offset;

        if (
          neighbor_column >= 0 &&
          neighbor_column < window_width_px &&
          neighbor_row >= 0 &&
          neighbor_row < window_height_px
        ) {
          MarkIfNonPaper(neighbor_column, neighbor_row);
        }
      }
    }
  }

  return outside;
}
