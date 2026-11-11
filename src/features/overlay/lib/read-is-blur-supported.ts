let is_blur_supported: boolean | null = null;

// Checked once for each content-script session (spec 0003 §8.5).
export function ReadIsBlurSupported(): boolean {
  is_blur_supported ??=
    CSS.supports('backdrop-filter', 'blur(1px)') &&
    CSS.supports('mask-composite', 'intersect');

  return is_blur_supported;
}
