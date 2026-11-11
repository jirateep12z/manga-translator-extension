import { IsRecord } from '@/lib/is-record';

function ParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function ReadNodes(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!IsRecord(parsed)) return [];

  return Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
}

function ReadName(node: unknown): string | null {
  return IsRecord(node) && typeof node.name === 'string' ? node.name : null;
}

function ReadNodeNames(node: Record<string, unknown>): string[] {
  const parents = Array.isArray(node.isPartOf)
    ? node.isPartOf
    : [node.isPartOf];

  return [...parents.map(ReadName), ReadName(node)].filter(
    (name): name is string => name !== null
  );
}

export function ExtractJsonLdNames(json_ld_texts: string[]): string[] {
  return json_ld_texts.flatMap(text =>
    ReadNodes(ParseJson(text))
      .filter(IsRecord)
      .flatMap(node => ReadNodeNames(node))
  );
}
