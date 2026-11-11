import { NormalizeText } from '@/lib/normalize-text';

const ALIAS_SEPARATOR_PATTERN = /[,\n]/;

export function ParseAliasInput(text: string): string[] {
  const seen_aliases = new Set<string>();
  const aliases: string[] = [];

  for (const part of text.split(ALIAS_SEPARATOR_PATTERN)) {
    const alias = part.trim();
    const normalized_alias = NormalizeText(alias);

    if (normalized_alias === '' || seen_aliases.has(normalized_alias)) continue;

    seen_aliases.add(normalized_alias);
    aliases.push(alias);
  }

  return aliases;
}
