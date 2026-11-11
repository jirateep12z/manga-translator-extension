import type { KeyboardEvent, MouseEvent } from 'react';

// A click, Enter, or Space toggles a region, and stops there so the page does
// not react to it.
export function CreateRegionToggleHandlers(OnToggle: () => void): {
  HandleClick: (event: MouseEvent<HTMLElement>) => void;
  HandleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  return {
    HandleClick(event) {
      event.stopPropagation();
      OnToggle();
    },
    HandleKeyDown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      event.stopPropagation();
      OnToggle();
    }
  };
}
