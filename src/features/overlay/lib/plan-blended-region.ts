import { CalculateContrastRatio, CalculateLuma } from '@/lib/color';
import type { BboxPx, RegionAppearance, RegionKind } from '@/services/database';
import type { RgbColor } from '@/types/rgb-color';
import {
  BLACK_HALO_COLOR,
  BLUR_FADE_MIN_PX,
  BLUR_FADE_RATIO,
  BLUR_RADIUS_MIN_PX,
  BLUR_RADIUS_RATIO,
  BLUR_TINT_ALPHA,
  DARK_TEXT_COLOR,
  DARK_TEXT_MAX_LUMA,
  HALO_BACKGROUND_MAX_LUMA,
  HALO_BACKGROUND_MIN_LUMA,
  HALO_MIN_PX,
  HALO_RATIO_TEXT,
  ITIM_STROKE_MIN_FONT_PX,
  LABEL_HALO_MIN_PX,
  LABEL_HALO_RATIO,
  LIGHT_TEXT_COLOR,
  MIN_TEXT_CONTRAST_RATIO,
  PATCH_FEATHER_MIN_PX,
  PATCH_FEATHER_RATIO,
  TEXT_FONT_CAP_MAX_PX,
  TEXT_FONT_CAP_MIN_PX,
  TEXT_FONT_CAP_RATIO_HORIZONTAL,
  TEXT_FONT_CAP_RATIO_VERTICAL,
  TINT_FALLBACK_ALPHA,
  WHITE_HALO_COLOR
} from '../constants/overlay';
import type {
  BlendedFit,
  BlendedRegionPlan,
  ClipInsets,
  DocumentRect,
  HaloPlan,
  OverlayFont,
  PatchPlan,
  PixelSize
} from '../types/overlay';
import { FitBlendedText } from './fit-blended-text';
import { CenterGrownBox } from './fit-overlay-text';
import { ComputeLabelFontSize, PlaceLabel } from './place-label';
import { ScaleRegionBox } from './scale-region-box';

const SOLID_PATCH_ALPHA = 1;

// Scales a page box to CSS pixels, relative to the page's content rect.
type ScalePageBox = (box_px: BboxPx) => DocumentRect;

type MeasureTextHeight = (width_px: number, font_size_px: number) => number;

type MeasureWidestWordWidth = (font_size_px: number) => number;

type CandidateFit = {
  box_px: BboxPx; // the candidate's page box
  rect: DocumentRect; // the candidate in CSS pixels, relative to the content rect
  fitted: BlendedFit;
};

type TextColorChoice = { color: RgbColor; is_replaced: boolean };

function ClampFontSize(
  font_size_px: number,
  min_font_size_px: number,
  max_font_size_px: number
): number {
  return Math.min(max_font_size_px, Math.max(min_font_size_px, font_size_px));
}

// The largest font size for the region's orientation (spec 0003 §8.4). Only
// text lettering is redrawn since Amendment 2 (§20), so it has the only cap.
function CalculateMaxFontSizePx(
  appearance: RegionAppearance,
  glyph_css_px: number
): number {
  const cap_ratio = appearance.is_vertical
    ? TEXT_FONT_CAP_RATIO_VERTICAL
    : TEXT_FONT_CAP_RATIO_HORIZONTAL;

  return Math.floor(
    ClampFontSize(
      glyph_css_px * cap_ratio,
      TEXT_FONT_CAP_MIN_PX,
      TEXT_FONT_CAP_MAX_PX
    )
  );
}

function CalculateArea(rect: DocumentRect): number {
  return rect.width_px * rect.height_px;
}

// A candidate that fits beats one that overflows. Then one that keeps words
// whole beats one that splits them, then the larger font size wins, then the
// larger area. A tie keeps the earlier candidate.
function IsBetterFit(candidate: CandidateFit, kept: CandidateFit): boolean {
  if (candidate.fitted.is_overflowing !== kept.fitted.is_overflowing) {
    return !candidate.fitted.is_overflowing;
  }

  if (candidate.fitted.is_word_split !== kept.fitted.is_word_split) {
    return !candidate.fitted.is_word_split;
  }

  if (candidate.fitted.font_size_px !== kept.fitted.font_size_px) {
    return candidate.fitted.font_size_px > kept.fitted.font_size_px;
  }

  return CalculateArea(candidate.rect) > CalculateArea(kept.rect);
}

// Fits the text in each candidate, in order, and keeps the best one (spec 0003
// §8.4). IsRegionAppearance guarantees at least one candidate.
function ChooseTextBox(input: {
  candidate_boxes_px: readonly BboxPx[];
  max_font_size_px: number;
  ScaleBox: ScalePageBox;
  MeasureTextHeight: MeasureTextHeight;
  MeasureWidestWordWidth: MeasureWidestWordWidth;
}): CandidateFit {
  const candidate_fits = input.candidate_boxes_px.map(
    (box_px): CandidateFit => {
      const rect = input.ScaleBox(box_px);

      return {
        box_px,
        rect,
        fitted: FitBlendedText({
          box_width_px: rect.width_px,
          box_height_px: rect.height_px,
          max_font_size_px: input.max_font_size_px,
          MeasureTextHeight: font_size_px =>
            input.MeasureTextHeight(rect.width_px, font_size_px),
          MeasureWidestWordWidth: input.MeasureWidestWordWidth
        })
      };
    }
  );

  return candidate_fits.reduce((kept, candidate) =>
    IsBetterFit(candidate, kept) ? candidate : kept
  );
}

// Remembers the widest word's width for each font size. The widest word does
// not depend on the box, so a region measures it once for each font size and
// reuses it across its candidates (spec 0003 §8.4).
function CacheMeasureBySize(
  Measure: MeasureWidestWordWidth
): MeasureWidestWordWidth {
  const width_by_font_size_px = new Map<number, number>();

  return font_size_px => {
    const cached_width_px = width_by_font_size_px.get(font_size_px);

    if (cached_width_px !== undefined) return cached_width_px;

    const width_px = Measure(font_size_px);

    width_by_font_size_px.set(font_size_px, width_px);

    return width_px;
  };
}

// The smallest page box that holds both boxes.
function UnitePageBoxes(first_box_px: BboxPx, second_box_px: BboxPx): BboxPx {
  const x_px = Math.min(first_box_px.x_px, second_box_px.x_px);
  const y_px = Math.min(first_box_px.y_px, second_box_px.y_px);
  const right_px = Math.max(
    first_box_px.x_px + first_box_px.width_px,
    second_box_px.x_px + second_box_px.width_px
  );
  const bottom_px = Math.max(
    first_box_px.y_px + first_box_px.height_px,
    second_box_px.y_px + second_box_px.height_px
  );

  return {
    x_px,
    y_px,
    width_px: right_px - x_px,
    height_px: bottom_px - y_px
  };
}

function GrowRect(rect: DocumentRect, margin_px: number): DocumentRect {
  return {
    left_px: rect.left_px - margin_px,
    top_px: rect.top_px - margin_px,
    width_px: rect.width_px + margin_px * 2,
    height_px: rect.height_px + margin_px * 2
  };
}

// A patch before it is clipped to the content rect.
type UnclippedPatchPlan = PatchPlan extends infer Patch
  ? Patch extends PatchPlan
    ? Omit<Patch, 'clip_insets_px'>
    : never
  : never;

// The insets that clip a rect to the content rect, whose origin is 0, or null
// when no part of the rect with a positive area lies inside it (spec 0003
// §8.5, "Clipping"). Subtracting from the origin keeps a zero inset positive.
function CalculateClipInsets(
  rect: DocumentRect,
  content_size: PixelSize
): ClipInsets | null {
  const right_edge_px = rect.left_px + rect.width_px;
  const bottom_edge_px = rect.top_px + rect.height_px;
  const is_inside_horizontally =
    Math.min(right_edge_px, content_size.width_px) > Math.max(rect.left_px, 0);
  const is_inside_vertically =
    Math.min(bottom_edge_px, content_size.height_px) > Math.max(rect.top_px, 0);

  if (!is_inside_horizontally || !is_inside_vertically) return null;

  return {
    top: 0 - rect.top_px,
    right: right_edge_px - content_size.width_px,
    bottom: bottom_edge_px - content_size.height_px,
    left: 0 - rect.left_px
  };
}

// What hides the original lettering (spec 0003 §8.5), clipped to the content
// rect so that its glow or fade never spills past the page image, or null when
// it would lie wholly outside it ("Clipping").
function PlanPatch(input: {
  appearance: RegionAppearance;
  chosen_box_px: BboxPx;
  glyph_css_px: number;
  is_blur_supported: boolean;
  content_size: PixelSize;
  ScaleBox: ScalePageBox;
}): PatchPlan | null {
  const patch = PlanUnclippedPatch(input);
  const clip_insets_px = CalculateClipInsets(patch.rect, input.content_size);

  if (clip_insets_px === null) return null;

  return { ...patch, clip_insets_px };
}

// A solid patch on a flat backdrop; on a textured one, a blur, or a tint where
// the browser cannot blur.
function PlanUnclippedPatch(input: {
  appearance: RegionAppearance;
  chosen_box_px: BboxPx;
  glyph_css_px: number;
  is_blur_supported: boolean;
  ScaleBox: ScalePageBox;
}): UnclippedPatchPlan {
  const { appearance, glyph_css_px } = input;
  const feather_px = Math.max(
    PATCH_FEATHER_MIN_PX,
    glyph_css_px * PATCH_FEATHER_RATIO
  );

  if (appearance.backdrop === 'flat') {
    return {
      kind: 'solid',
      rect: input.ScaleBox(
        UnitePageBoxes(appearance.cover_box_px, input.chosen_box_px)
      ),
      color: appearance.background_color,
      alpha: SOLID_PATCH_ALPHA,
      radius_px: feather_px,
      feather_px
    };
  }

  const cover_rect = input.ScaleBox(appearance.cover_box_px);

  if (!input.is_blur_supported) {
    return {
      kind: 'tint',
      rect: cover_rect,
      color: appearance.background_color,
      alpha: TINT_FALLBACK_ALPHA,
      radius_px: feather_px,
      feather_px
    };
  }

  const fade_px = Math.max(BLUR_FADE_MIN_PX, glyph_css_px * BLUR_FADE_RATIO);

  return {
    kind: 'blur',
    rect: GrowRect(cover_rect, fade_px),
    color: appearance.background_color,
    alpha: BLUR_TINT_ALPHA,
    blur_px: Math.max(BLUR_RADIUS_MIN_PX, glyph_css_px * BLUR_RADIUS_RATIO),
    fade_px
  };
}

function IsDarkColor(color: RgbColor): boolean {
  return CalculateLuma(color) < DARK_TEXT_MAX_LUMA;
}

// The ink color when it contrasts enough with the background. Otherwise the
// dark text color, unless the light one contrasts more (spec 0003 §8.6).
function ChooseTextColor(appearance: RegionAppearance): TextColorChoice {
  const { ink_color, background_color } = appearance;

  if (
    CalculateContrastRatio(ink_color, background_color) >=
    MIN_TEXT_CONTRAST_RATIO
  ) {
    return { color: ink_color, is_replaced: false };
  }

  const is_dark_text_chosen =
    CalculateContrastRatio(DARK_TEXT_COLOR, background_color) >=
    CalculateContrastRatio(LIGHT_TEXT_COLOR, background_color);

  return {
    color: is_dark_text_chosen ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR,
    is_replaced: true
  };
}

// The halo around redrawn text (spec 0003 §8.6, as amended by §20): only on a
// textured backdrop or after the text color was replaced, in the background
// color when that contrasts enough.
function PlanHalo(input: {
  appearance: RegionAppearance;
  text_color: TextColorChoice;
  font_size_px: number;
}): HaloPlan | null {
  const { appearance, text_color, font_size_px } = input;

  if (appearance.backdrop === 'flat' && !text_color.is_replaced) return null;

  const is_dark_text = IsDarkColor(text_color.color);
  const contrasting_halo_color = is_dark_text
    ? WHITE_HALO_COLOR
    : BLACK_HALO_COLOR;
  const background_luma = CalculateLuma(appearance.background_color);
  const is_background_halo = is_dark_text
    ? background_luma > HALO_BACKGROUND_MIN_LUMA
    : background_luma < HALO_BACKGROUND_MAX_LUMA;

  return {
    color: is_background_halo
      ? appearance.background_color
      : contrasting_halo_color,
    width_px: Math.max(HALO_MIN_PX, font_size_px * HALO_RATIO_TEXT)
  };
}

// Itim text gets an outline in its own color from ITIM_STROKE_MIN_FONT_PX
// (spec 0003 §8.6).
function HasOutline(font: OverlayFont, font_size_px: number): boolean {
  return font === 'itim' && font_size_px >= ITIM_STROKE_MIN_FONT_PX;
}

// A label for display lettering, the AI reader's open-frame sound effects, and
// open-frame text on a textured or dark backdrop, which stay in view with no
// patch (spec 0003 §8.1 and §8.7, as amended by §20 and §22): dark text with a
// white halo when the ink is dark, and light text with a black halo otherwise.
function PlanLabel(input: {
  appearance: RegionAppearance;
  region_rect: DocumentRect;
  content_size: PixelSize;
  glyph_css_px: number;
  font: OverlayFont;
  MeasureTextHeight: MeasureTextHeight;
}): BlendedRegionPlan {
  const font_size_px = ComputeLabelFontSize(input.glyph_css_px);
  const is_dark_ink = IsDarkColor(input.appearance.ink_color);

  return {
    kind: 'label',
    patch: null,
    text: {
      font: input.font,
      rect: PlaceLabel({
        region_rect: input.region_rect,
        content_size: input.content_size,
        font_size_px,
        MeasureTextHeight: input.MeasureTextHeight
      }),
      font_size_px,
      is_overflowing: false,
      color: is_dark_ink ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR,
      halo: {
        color: is_dark_ink ? WHITE_HALO_COLOR : BLACK_HALO_COLOR,
        width_px: Math.max(LABEL_HALO_MIN_PX, font_size_px * LABEL_HALO_RATIO)
      },
      has_outline: HasOutline(input.font, font_size_px)
    }
  };
}

// Display lettering keeps its original and gets a label, and so do a sound
// effect that the AI reader names outside a closed frame and any text outside
// a closed frame on a textured or dark backdrop (spec 0003 §8.1, as amended by
// §20 and §22).
function IsLabeled(appearance: RegionAppearance, kind: RegionKind): boolean {
  const is_open_frame = appearance.frame === 'open';

  return (
    appearance.lettering !== 'text' ||
    (kind === 'sfx' && is_open_frame) ||
    (is_open_frame &&
      (appearance.backdrop === 'textured' ||
        IsDarkColor(appearance.background_color)))
  );
}

// Plans how a region with appearance is drawn (spec 0003 §8.4–§8.7). Display
// lettering, open-frame sound effects, and open-frame text on a textured or
// dark backdrop get a label. Any other region is redrawn: a patch hides the
// original lettering, and the text takes the box and font size chosen from its
// candidates, with its color, halo, and outline.
// Rects are in CSS pixels, relative to the page's content rect.
export function PlanBlendedRegion(input: {
  appearance: RegionAppearance;
  bbox_px: BboxPx;
  kind: RegionKind;
  natural_size: PixelSize;
  content_size: PixelSize;
  font: OverlayFont;
  is_blur_supported: boolean;
  MeasureTextHeight: MeasureTextHeight;
  MeasureWidestWordWidth: MeasureWidestWordWidth;
}): BlendedRegionPlan {
  const { appearance, natural_size, content_size } = input;
  const content_rect: DocumentRect = { left_px: 0, top_px: 0, ...content_size };
  const ScaleBox: ScalePageBox = box_px =>
    ScaleRegionBox(box_px, natural_size, content_rect);
  const glyph_css_px =
    (appearance.glyph_size_px * content_size.width_px) / natural_size.width_px;

  if (IsLabeled(appearance, input.kind)) {
    return PlanLabel({
      appearance,
      region_rect: ScaleBox(input.bbox_px),
      content_size,
      glyph_css_px,
      font: input.font,
      MeasureTextHeight: input.MeasureTextHeight
    });
  }

  const chosen = ChooseTextBox({
    candidate_boxes_px: appearance.text_box_candidates_px,
    max_font_size_px: CalculateMaxFontSizePx(appearance, glyph_css_px),
    ScaleBox,
    MeasureTextHeight: input.MeasureTextHeight,
    MeasureWidestWordWidth: CacheMeasureBySize(input.MeasureWidestWordWidth)
  });
  const { font_size_px } = chosen.fitted;
  const text_color = ChooseTextColor(appearance);

  return {
    kind: 'redrawn',
    patch: PlanPatch({
      appearance,
      chosen_box_px: chosen.box_px,
      glyph_css_px,
      is_blur_supported: input.is_blur_supported,
      content_size,
      ScaleBox
    }),
    text: {
      font: input.font,
      rect: CenterGrownBox(chosen.rect, chosen.fitted.box_height_px),
      font_size_px,
      is_overflowing: chosen.fitted.is_overflowing,
      color: text_color.color,
      halo: PlanHalo({ appearance, text_color, font_size_px }),
      has_outline: HasOutline(input.font, font_size_px)
    }
  };
}
