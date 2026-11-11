import type { RgbColor } from '@/types/rgb-color';

export const LUMA_RED_WEIGHT = 0.299;
export const LUMA_GREEN_WEIGHT = 0.587;
export const LUMA_BLUE_WEIGHT = 0.114;

// WCAG 2.2 relative luminance and contrast ratio.
const CHANNEL_MAX_VALUE = 255;
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;
const LUMINANCE_RED_WEIGHT = 0.2126;
const LUMINANCE_GREEN_WEIGHT = 0.7152;
const LUMINANCE_BLUE_WEIGHT = 0.0722;
const CONTRAST_FLARE = 0.05;

const OPAQUE_ALPHA = 1;

// ITU-R BT.601 luma, from 0 to 255, not rounded.
export function CalculateLuma([red, green, blue]: RgbColor): number {
  return (
    LUMA_RED_WEIGHT * red + LUMA_GREEN_WEIGHT * green + LUMA_BLUE_WEIGHT * blue
  );
}

function ToLinearChannel(channel_value: number): number {
  const channel = channel_value / CHANNEL_MAX_VALUE;

  return channel <= SRGB_LINEAR_THRESHOLD
    ? channel / SRGB_LINEAR_DIVISOR
    : ((channel + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) **
        SRGB_GAMMA_EXPONENT;
}

function CalculateRelativeLuminance([red, green, blue]: RgbColor): number {
  return (
    LUMINANCE_RED_WEIGHT * ToLinearChannel(red) +
    LUMINANCE_GREEN_WEIGHT * ToLinearChannel(green) +
    LUMINANCE_BLUE_WEIGHT * ToLinearChannel(blue)
  );
}

// The WCAG 2.2 contrast ratio, from 1 to 21, in either order.
export function CalculateContrastRatio(
  first: RgbColor,
  second: RgbColor
): number {
  const first_luminance = CalculateRelativeLuminance(first);
  const second_luminance = CalculateRelativeLuminance(second);
  const lighter_luminance = Math.max(first_luminance, second_luminance);
  const darker_luminance = Math.min(first_luminance, second_luminance);

  return (
    (lighter_luminance + CONTRAST_FLARE) / (darker_luminance + CONTRAST_FLARE)
  );
}

// A CSS color, with the alpha written only below 1.
export function ToCssColor(
  [red, green, blue]: RgbColor,
  alpha = OPAQUE_ALPHA
): string {
  return alpha === OPAQUE_ALPHA
    ? `rgb(${red} ${green} ${blue})`
    : `rgb(${red} ${green} ${blue} / ${alpha})`;
}
