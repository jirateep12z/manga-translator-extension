import { PLACEHOLDER_DATA_URL_MAX_LENGTH } from '../constants/page-scanner';
import type { ImageSnapshot } from '../types/page-scanner';

export function IsPlaceholderSource(source: string): boolean {
  const trimmed_source = source.trim();

  return (
    trimmed_source === '' ||
    trimmed_source === 'about:blank' ||
    (trimmed_source.startsWith('data:') &&
      trimmed_source.length < PLACEHOLDER_DATA_URL_MAX_LENGTH)
  );
}

export function ResolveEffectiveSource(snapshot: ImageSnapshot): string | null {
  const primary_source = snapshot.current_src || snapshot.src_attribute;

  if (!IsPlaceholderSource(primary_source)) return primary_source;

  return (
    snapshot.lazy_attribute_values.find(
      lazy_value => !IsPlaceholderSource(lazy_value)
    ) ?? null
  );
}
