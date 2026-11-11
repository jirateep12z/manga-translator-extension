import {
  MAX_CONTEXT_DIALOGUE_CHARS,
  MAX_CONTEXT_DIALOGUE_LINES
} from '../constants/memory';
import type { DialogueLine, DialoguePage } from '../types/memory';

function CountLineCodePoints(line: Omit<DialogueLine, 'page_index'>): number {
  return (
    Array.from(line.source_text).length +
    Array.from(line.translated_text).length
  );
}

// Spec 0004 §5.2: the nearest lines that fit both limits, oldest first.
export function SelectDialogueWindow(
  pages: readonly DialoguePage[]
): DialogueLine[] {
  const nearest_first_pages = [...pages].sort(
    (left, right) => right.page_index - left.page_index
  );
  const selected_lines: DialogueLine[] = [];
  let selected_code_points = 0;

  for (const page of nearest_first_pages) {
    for (const line of [...page.lines].reverse()) {
      const line_code_points = CountLineCodePoints(line);

      if (line_code_points > MAX_CONTEXT_DIALOGUE_CHARS) continue;

      const is_over_limit =
        selected_lines.length + 1 > MAX_CONTEXT_DIALOGUE_LINES ||
        selected_code_points + line_code_points > MAX_CONTEXT_DIALOGUE_CHARS;

      if (is_over_limit) return selected_lines.reverse();

      selected_lines.push({ page_index: page.page_index, ...line });
      selected_code_points += line_code_points;
    }
  }

  return selected_lines.reverse();
}
