import type {
  PageResult,
  RenderedRegion
} from '@/features/chapter-translation';
import { IsUnchangedTranslation } from './is-unchanged-translation';

// The regions a page draws, in their order: none on a page already in the
// target language, and none whose translation repeats its source text
// (spec 0003 §8.2).
export function ListDrawnRegions(
  result: Pick<PageResult, 'outcome' | 'regions'>
): RenderedRegion[] {
  if (result.outcome === 'already_in_target_language') return [];

  return result.regions.filter(
    region =>
      !IsUnchangedTranslation(region.source_text, region.translated_text)
  );
}
