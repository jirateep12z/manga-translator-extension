import type { ValidationResult } from '../types/pipeline';

const INVALID_JSON_ERROR = 'Response is not valid JSON.';
const CODE_FENCE = '```';

function StripCodeFence(text: string): string {
  if (!text.startsWith(CODE_FENCE)) return text;

  const lines = text.split('\n').slice(1);

  if (lines.length > 0 && lines[lines.length - 1].trim() === CODE_FENCE) {
    lines.pop();
  }

  return lines.join('\n');
}

function TryParse(text: string): { is_parsed: boolean; value: unknown } {
  try {
    return { is_parsed: true, value: JSON.parse(text) };
  } catch {
    return { is_parsed: false, value: undefined };
  }
}

export function ParseModelJson(text: string): ValidationResult<unknown> {
  const unfenced_text = StripCodeFence(text.trim());
  const direct = TryParse(unfenced_text);

  if (direct.is_parsed) return { is_valid: true, value: direct.value };

  const object_start = unfenced_text.indexOf('{');
  const object_end = unfenced_text.lastIndexOf('}');

  if (object_start !== -1 && object_end > object_start) {
    const embedded = TryParse(
      unfenced_text.slice(object_start, object_end + 1)
    );

    if (embedded.is_parsed) return { is_valid: true, value: embedded.value };
  }

  return { is_valid: false, error: INVALID_JSON_ERROR };
}
