export type ViewportRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

export function IsFullyInViewport(
  rect: ViewportRect,
  viewport: { width_px: number; height_px: number }
): boolean {
  return (
    rect.right > rect.left &&
    rect.bottom > rect.top &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.right <= viewport.width_px &&
    rect.bottom <= viewport.height_px
  );
}

export function CreateCaptureRect(rect: ViewportRect): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top
  };
}
