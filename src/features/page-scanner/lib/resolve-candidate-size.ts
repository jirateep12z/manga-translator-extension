import type { ImageSnapshot } from '../types/page-scanner';
import { IsPlaceholderSource } from './resolve-effective-source';

export function ResolveCandidateSize(
  snapshot: ImageSnapshot
): { width_px: number; height_px: number } | null {
  const has_real_natural_size =
    snapshot.is_loaded &&
    snapshot.natural_width_px > 0 &&
    !IsPlaceholderSource(snapshot.current_src || snapshot.src_attribute);

  if (has_real_natural_size) {
    return {
      width_px: snapshot.natural_width_px,
      height_px: snapshot.natural_height_px
    };
  }

  const { attribute_width_px, attribute_height_px } = snapshot;

  if (
    attribute_width_px !== null &&
    attribute_height_px !== null &&
    attribute_width_px > 0 &&
    attribute_height_px > 0
  ) {
    return { width_px: attribute_width_px, height_px: attribute_height_px };
  }

  if (snapshot.rendered_width_px > 0 && snapshot.rendered_height_px > 0) {
    return {
      width_px: snapshot.rendered_width_px,
      height_px: snapshot.rendered_height_px
    };
  }

  return null;
}
