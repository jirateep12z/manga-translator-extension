import type { TargetLanguage } from '@/types/target-language';
import { BLENDED_LINE_HEIGHT } from '../constants/overlay';
import type { OverlayTypography } from '../types/overlay';

const MEASURER_CLASS_NAME =
  'pointer-events-none invisible absolute top-0 -left-[99999px] px-1 py-0.5 text-center leading-tight font-sans font-medium break-words whitespace-normal';
// Blended text has no padding and balances its lines (spec 0003 §8.3).
const BLENDED_MEASURER_CLASS_NAME =
  'pointer-events-none invisible absolute top-0 -left-[99999px] text-center break-words text-balance whitespace-normal';
const MIN_CONTENT_WIDTH = 'min-content';

export type BlendedMeasurerOptions = {
  typography: OverlayTypography;
  lang: TargetLanguage;
};

// The outline is left out, because it does not change the layout
// (spec 0003 §8.3).
function ApplyBlendedTypography(
  measurer_element: HTMLElement,
  blended: BlendedMeasurerOptions
): void {
  measurer_element.style.fontFamily = blended.typography.font_family;
  measurer_element.style.fontWeight = String(blended.typography.font_weight);
  measurer_element.style.lineHeight = String(BLENDED_LINE_HEIGHT);
  measurer_element.lang = blended.lang;
}

export function CreateTextMeasurer(
  container: HTMLElement,
  blended?: BlendedMeasurerOptions
): (text: string, width_px: number, font_size_px: number) => number {
  const measurer_element = document.createElement('div');

  measurer_element.className = blended
    ? BLENDED_MEASURER_CLASS_NAME
    : MEASURER_CLASS_NAME;
  measurer_element.setAttribute('aria-hidden', 'true');

  if (blended) ApplyBlendedTypography(measurer_element, blended);

  container.append(measurer_element);

  return (text, width_px, font_size_px) => {
    measurer_element.style.width = `${width_px}px`;
    measurer_element.style.fontSize = `${font_size_px}px`;
    measurer_element.textContent = text;

    return measurer_element.scrollHeight;
  };
}

// The min-content width is the widest word, and `overflow-wrap: break-word`
// does not change it (spec 0003 §8.3).
export function CreateWidestWordMeasurer(
  container: HTMLElement,
  blended: BlendedMeasurerOptions
): (text: string, font_size_px: number) => number {
  const measurer_element = document.createElement('div');

  measurer_element.className = BLENDED_MEASURER_CLASS_NAME;
  measurer_element.setAttribute('aria-hidden', 'true');
  measurer_element.style.width = MIN_CONTENT_WIDTH;
  ApplyBlendedTypography(measurer_element, blended);
  container.append(measurer_element);

  return (text, font_size_px) => {
    measurer_element.style.fontSize = `${font_size_px}px`;
    measurer_element.textContent = text;

    return measurer_element.getBoundingClientRect().width;
  };
}
