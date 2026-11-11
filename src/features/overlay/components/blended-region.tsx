import type { TargetLanguage } from '@/types/target-language';
import {
  ORIGINAL_CLASS_NAME,
  ORIGINAL_REGION_LABEL
} from '../constants/overlay';
import { BuildPatchStyle, BuildTextStyles } from '../lib/build-blended-styles';
import { CreateRegionToggleHandlers } from '../lib/create-region-toggle-handlers';
import type {
  BlendedTextPlan,
  DocumentRect,
  PatchPlan
} from '../types/overlay';

type Origin = Pick<DocumentRect, 'left_px' | 'top_px'>;

type BlendedRegionProps = {
  region_key: string;
  text: string;
  target_language: TargetLanguage;
  text_plan: BlendedTextPlan;
  region_rect: DocumentRect; // the scaled region box, placed on the document
  origin: Origin;
  is_original: boolean;
  OnToggle: () => void;
};

// Both copies of the text share one grid cell, so the halo sits exactly
// behind the front text. The text is not clipped (spec 0003 §8.8).
const BLENDED_TEXT_CLASS_NAME =
  'pointer-events-auto absolute grid place-items-center text-center break-words text-balance focus-visible:outline-2 focus-visible:outline-sky-600';
// Each copy fills the cell and may shrink below its longest word, so a word
// wider than the box wraps as the blended measurer wraps it. A grid item's
// default minimum width would widen the cell past the box instead.
const HALO_TEXT_CLASS_NAME = 'w-full min-w-0 select-none';
const FRONT_TEXT_CLASS_NAME = 'w-full min-w-0 select-text';
const PATCH_CLASS_NAME = 'absolute';

export function BlendedRegionPatch({
  patch,
  origin
}: {
  patch: PatchPlan;
  origin: Origin;
}) {
  return (
    <div className={PATCH_CLASS_NAME} style={BuildPatchStyle(patch, origin)} />
  );
}

// A blended region or label, as one element in both states, so that a toggle
// keeps keyboard focus on it (spec 0001 §9.3). In the original state, it is the
// scaled region box with a dashed outline, as today's original state (spec
// 0003 §8.8).
export function BlendedRegion({
  region_key,
  text,
  target_language,
  text_plan,
  region_rect,
  origin,
  is_original,
  OnToggle
}: BlendedRegionProps) {
  const styles = is_original ? null : BuildTextStyles(text_plan, origin);
  const { HandleClick, HandleKeyDown } = CreateRegionToggleHandlers(OnToggle);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={is_original}
      aria-label={is_original ? ORIGINAL_REGION_LABEL : undefined}
      data-region-key={region_key}
      lang={is_original ? undefined : target_language}
      className={is_original ? ORIGINAL_CLASS_NAME : BLENDED_TEXT_CLASS_NAME}
      style={
        styles
          ? styles.container
          : {
              left: region_rect.left_px,
              top: region_rect.top_px,
              width: region_rect.width_px,
              height: region_rect.height_px
            }
      }
      onClick={HandleClick}
      onKeyDown={HandleKeyDown}
    >
      {styles?.halo ? (
        <span
          aria-hidden="true"
          className={HALO_TEXT_CLASS_NAME}
          style={styles.halo}
        >
          {text}
        </span>
      ) : null}
      {styles ? (
        <span className={FRONT_TEXT_CLASS_NAME} style={styles.front}>
          {text}
        </span>
      ) : null}
    </div>
  );
}
