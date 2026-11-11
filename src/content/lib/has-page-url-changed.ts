function ReadPageKey(url: string): string | null {
  try {
    const parsed_url = new URL(url);

    return `${parsed_url.origin}${parsed_url.pathname}${parsed_url.search}`;
  } catch {
    return null;
  }
}

export function HasPageUrlChanged(
  previous_url: string,
  next_url: string
): boolean {
  const previous_key = ReadPageKey(previous_url);
  const next_key = ReadPageKey(next_url);

  if (previous_key === null || next_key === null) {
    return previous_url !== next_url;
  }

  return previous_key !== next_key;
}
