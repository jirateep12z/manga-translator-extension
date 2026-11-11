import { ToCssColor } from '@/lib/color';
import type { CSSProperties } from 'react';
import {
  BLENDED_LINE_HEIGHT,
  ITIM_STROKE_EM,
  OVERLAY_TYPOGRAPHY
} from '../constants/overlay';
import type {
  BlendedTextPlan,
  ClipInsets,
  DocumentRect,
  HaloPlan,
  PatchPlan
} from '../types/overlay';

type ContentOrigin = Pick<DocumentRect, 'left_px' | 'top_px'>;

const FADE_DIRECTIONS = ['to right', 'to bottom'] as const;
// The halo and the front text share one grid cell, so they overlap exactly.
const STACKED_GRID_AREA = '1 / 1';
// The copies take the container's typography, because `src/index.css` sets
// font-family on every element of the content script's shadow root (spec 0003
// §8.3).
const INHERITED_TYPOGRAPHY = {
  fontFamily: 'inherit',
  fontWeight: 'inherit'
} as const satisfies CSSProperties;

// Places a rect that is relative to the content rect on the document.
function BuildPlacement(
  rect: DocumentRect,
  origin: ContentOrigin
): CSSProperties {
  return {
    left: origin.left_px + rect.left_px,
    top: origin.top_px + rect.top_px,
    width: rect.width_px,
    height: rect.height_px
  };
}

// Opaque inside, transparent at both ends, in one direction.
function BuildFadeGradient(
  direction: (typeof FADE_DIRECTIONS)[number],
  fade_px: number
): string {
  return `linear-gradient(${direction}, transparent 0, black ${fade_px}px, black calc(100% - ${fade_px}px), transparent 100%)`;
}

// Clips the patch, with its glow or fade, to the content rect (spec 0003 §8.5,
// "Clipping"); clip-path also clips box-shadow, which overflow would not.
function BuildClipPath(clip_insets_px: ClipInsets): string {
  const { top, right, bottom, left } = clip_insets_px;

  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

// The inline style of a patch, placed at the page's content origin (spec 0003
// §8.5). Every value comes from the plan's numbers.
export function BuildPatchStyle(
  patch: PatchPlan,
  origin: ContentOrigin
): CSSProperties {
  const background_color = ToCssColor(patch.color, patch.alpha);
  const patch_base: CSSProperties = {
    ...BuildPlacement(patch.rect, origin),
    backgroundColor: background_color,
    clipPath: BuildClipPath(patch.clip_insets_px)
  };

  if (patch.kind === 'blur') {
    return {
      ...patch_base,
      backdropFilter: `blur(${patch.blur_px}px)`,
      maskImage: FADE_DIRECTIONS.map(direction =>
        BuildFadeGradient(direction, patch.fade_px)
      ).join(', '),
      maskComposite: 'intersect'
    };
  }

  // A solid patch has no glow, so its edge stays inside the paper that the
  // analysis found and never covers a frame's outline (spec 0003 §8.5, as
  // amended by §20).
  if (patch.kind === 'solid') {
    return { ...patch_base, borderRadius: patch.radius_px };
  }

  return {
    ...patch_base,
    borderRadius: patch.radius_px,
    boxShadow: `0 0 ${patch.feather_px}px ${patch.feather_px / 2}px ${background_color}`
  };
}

// A copy of the text behind it, stroked twice the halo width, since a stroke
// is centered on the glyph outline (spec 0003 §8.6, "Drawing a halo").
function BuildHaloStyle(halo: HaloPlan): CSSProperties {
  const halo_color = ToCssColor(halo.color);

  return {
    gridArea: STACKED_GRID_AREA,
    ...INHERITED_TYPOGRAPHY,
    color: halo_color,
    WebkitTextStroke: `${halo.width_px * 2}px ${halo_color}`
  };
}

function BuildFrontStyle(text: BlendedTextPlan): CSSProperties {
  const text_color = ToCssColor(text.color);
  const front_base: CSSProperties = {
    gridArea: STACKED_GRID_AREA,
    ...INHERITED_TYPOGRAPHY,
    color: text_color
  };

  if (!text.has_outline) return front_base;

  return {
    ...front_base,
    WebkitTextStroke: `${ITIM_STROKE_EM}em ${text_color}`
  };
}

// The inline styles of the text's container, its halo copy, and its front copy
// (spec 0003 §8.6). Every value comes from the plan's numbers.
export function BuildTextStyles(
  text: BlendedTextPlan,
  origin: ContentOrigin
): {
  container: CSSProperties;
  halo: CSSProperties | null;
  front: CSSProperties;
} {
  const typography = OVERLAY_TYPOGRAPHY[text.font];

  return {
    container: {
      ...BuildPlacement(text.rect, origin),
      fontFamily: typography.font_family,
      fontWeight: typography.font_weight,
      fontSize: text.font_size_px,
      lineHeight: BLENDED_LINE_HEIGHT
    },
    halo: text.halo === null ? null : BuildHaloStyle(text.halo),
    front: BuildFrontStyle(text)
  };
}
