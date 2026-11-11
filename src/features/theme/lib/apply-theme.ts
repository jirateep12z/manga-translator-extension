import type { Theme } from '../types/theme';

export function ApplyTheme(
  theme: Theme,
  target_element: HTMLElement = document.documentElement
): void {
  const is_dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  target_element.classList.toggle('dark', is_dark);
}
