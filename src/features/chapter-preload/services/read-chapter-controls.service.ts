import { ToChapterControl } from '../lib/select-next-chapter-control';
import type {
  ChapterControl,
  ChapterControlSnapshot
} from '../types/chapter-preload';

function ReadSnapshot(element: HTMLElement): ChapterControlSnapshot {
  return {
    tag: element.tagName.toLowerCase() === 'a' ? 'a' : 'button',
    raw_href: element.getAttribute('href'),
    rel: element.getAttribute('rel') ?? '',
    aria_label: element.getAttribute('aria-label'),
    title: element.getAttribute('title'),
    text_content: element.textContent ?? '',
    icon_classes: Array.from(
      element.querySelectorAll('svg, i'),
      icon => icon.getAttribute('class') ?? ''
    ),
    image_alts: Array.from(
      element.querySelectorAll('img'),
      image => image.getAttribute('alt') ?? ''
    ),
    has_disabled_attribute: element.hasAttribute('disabled'),
    aria_disabled: element.getAttribute('aria-disabled'),
    target: element.getAttribute('target')
  };
}

// Reads the page's links and buttons for the next-chapter finder (spec 0006
// §5.1). The extension's own panel is skipped.
export function ReadChapterControls(
  root: Document,
  own_host: Element | null,
  base_url: string
): { controls: ChapterControl[]; elements: HTMLElement[] } {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button')
  ).filter(element => own_host === null || !own_host.contains(element));

  return {
    controls: elements.map((element, control_index) =>
      ToChapterControl(ReadSnapshot(element), control_index, base_url)
    ),
    elements
  };
}
