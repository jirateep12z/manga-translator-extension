import { useMemo } from 'react';
import {
  ORIGINAL_CLASS_NAME,
  ORIGINAL_REGION_LABEL
} from '../constants/overlay';
import { CreateRegionToggleHandlers } from '../lib/create-region-toggle-handlers';
import { CenterGrownBox, FitOverlayText } from '../lib/fit-overlay-text';
import type { DocumentRect } from '../types/overlay';

type RegionBoxProps = {
  region_key: string;
  rect: DocumentRect;
  text: string;
  is_original: boolean;
  MeasureTextHeight: (font_size_px: number) => number;
  OnToggle: () => void;
};

const TRANSLATION_CLASS_NAME =
  'pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-sm bg-white px-1 py-0.5 text-center font-sans font-medium leading-tight text-neutral-900 select-text break-words focus-visible:outline-2 focus-visible:outline-sky-600';
// The text gets its own block that may shrink below its longest word, so a
// word wider than the box wraps as the text measurer wraps it. As the box's
// direct text, such a word widened all lines past both clipped edges.
const TRANSLATION_TEXT_CLASS_NAME = 'w-full min-w-0';

export function RegionBox({
  region_key,
  rect,
  text,
  is_original,
  MeasureTextHeight,
  OnToggle
}: RegionBoxProps) {
  const fitted_text = useMemo(
    () =>
      FitOverlayText({
        box_width_px: rect.width_px,
        box_height_px: rect.height_px,
        MeasureTextHeight
      }),
    // MeasureTextHeight changes with the text, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, rect.width_px, rect.height_px]
  );

  const box_rect = CenterGrownBox(rect, fitted_text.box_height_px);
  const { HandleClick, HandleKeyDown } = CreateRegionToggleHandlers(OnToggle);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={is_original}
      aria-label={is_original ? ORIGINAL_REGION_LABEL : undefined}
      data-region-key={region_key}
      className={is_original ? ORIGINAL_CLASS_NAME : TRANSLATION_CLASS_NAME}
      style={{
        left: box_rect.left_px,
        top: box_rect.top_px,
        width: box_rect.width_px,
        height: box_rect.height_px,
        fontSize: fitted_text.font_size_px
      }}
      onClick={HandleClick}
      onKeyDown={HandleKeyDown}
    >
      {is_original ? null : (
        <span className={TRANSLATION_TEXT_CLASS_NAME}>{text}</span>
      )}
    </div>
  );
}
