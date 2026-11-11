export function TruncateText(text: string, max_length: number): string {
  const trimmed_text = text.trim();
  const code_points = Array.from(trimmed_text);
  const limit = Math.max(0, Math.floor(max_length));

  return code_points.length <= limit
    ? trimmed_text
    : code_points.slice(0, limit).join('');
}
