const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const TRAILING_SLASHES_PATTERN = /\/+$/;

export type OllamaBaseUrlValidation =
  { is_valid: true; url: string } | { is_valid: false; error: string };

export function ValidateOllamaBaseUrl(text: string): OllamaBaseUrlValidation {
  const trimmed_text = text.trim();

  if (trimmed_text === '') {
    return { is_valid: false, error: 'Enter the Ollama URL.' };
  }

  let parsed_url: URL;

  try {
    parsed_url = new URL(trimmed_text);
  } catch {
    return {
      is_valid: false,
      error: 'Enter a valid URL, such as http://localhost:11434.'
    };
  }

  // "localhost:11434" parses with "localhost:" as its scheme.
  if (!ALLOWED_PROTOCOLS.has(parsed_url.protocol)) {
    return { is_valid: false, error: 'Use an http:// or https:// URL.' };
  }

  return {
    is_valid: true,
    url: `${parsed_url.origin}${parsed_url.pathname.replace(TRAILING_SLASHES_PATTERN, '')}`
  };
}
