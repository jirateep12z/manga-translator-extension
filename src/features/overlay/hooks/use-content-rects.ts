import { useEffect, useState } from 'react';
import { ToContentRect } from '../lib/scale-region-box';
import type { DocumentRect } from '../types/overlay';

const LAYOUT_POLL_INTERVAL_MS = 1000;

function ReadContentRect(element: HTMLImageElement): DocumentRect {
  const style = getComputedStyle(element);

  return ToContentRect(
    element.getBoundingClientRect(),
    {
      top: element.clientTop + (Number.parseFloat(style.paddingTop) || 0),
      right:
        element.offsetWidth -
        element.clientWidth -
        element.clientLeft +
        (Number.parseFloat(style.paddingRight) || 0),
      bottom:
        element.offsetHeight -
        element.clientHeight -
        element.clientTop +
        (Number.parseFloat(style.paddingBottom) || 0),
      left: element.clientLeft + (Number.parseFloat(style.paddingLeft) || 0)
    },
    { x: scrollX, y: scrollY }
  );
}

function IsSameRect(left: DocumentRect, right: DocumentRect): boolean {
  return (
    left.left_px === right.left_px &&
    left.top_px === right.top_px &&
    left.width_px === right.width_px &&
    left.height_px === right.height_px
  );
}

function HasRectsChanged(
  previous_rects: ReadonlyMap<string, DocumentRect>,
  next_rects: ReadonlyMap<string, DocumentRect>
): boolean {
  if (previous_rects.size !== next_rects.size) return true;

  for (const [page_id, next_rect] of next_rects) {
    const previous_rect = previous_rects.get(page_id);

    if (!previous_rect || !IsSameRect(previous_rect, next_rect)) return true;
  }

  return false;
}

export function UseContentRects(
  elements: ReadonlyMap<string, HTMLImageElement>
): ReadonlyMap<string, DocumentRect> {
  const [rects, set_rects] = useState<ReadonlyMap<string, DocumentRect>>(
    () => new Map()
  );

  useEffect(() => {
    let frame_id: number | null = null;

    function Recompute(): void {
      frame_id = null;

      const next_rects = new Map<string, DocumentRect>();

      for (const [page_id, element] of elements) {
        next_rects.set(page_id, ReadContentRect(element));
      }

      set_rects(previous_rects =>
        HasRectsChanged(previous_rects, next_rects)
          ? next_rects
          : previous_rects
      );
    }

    function ScheduleRecompute(): void {
      if (frame_id === null) frame_id = requestAnimationFrame(Recompute);
    }

    const resize_observer = new ResizeObserver(ScheduleRecompute);

    for (const element of elements.values()) resize_observer.observe(element);

    window.addEventListener('resize', ScheduleRecompute);
    document.addEventListener('scroll', ScheduleRecompute, {
      capture: true,
      passive: true
    });
    document.addEventListener('load', ScheduleRecompute, { capture: true });

    const interval_id = setInterval(ScheduleRecompute, LAYOUT_POLL_INTERVAL_MS);

    ScheduleRecompute();

    return () => {
      if (frame_id !== null) cancelAnimationFrame(frame_id);

      resize_observer.disconnect();
      window.removeEventListener('resize', ScheduleRecompute);
      document.removeEventListener('scroll', ScheduleRecompute, {
        capture: true
      });
      document.removeEventListener('load', ScheduleRecompute, {
        capture: true
      });
      clearInterval(interval_id);
    };
  }, [elements]);

  return rects;
}
