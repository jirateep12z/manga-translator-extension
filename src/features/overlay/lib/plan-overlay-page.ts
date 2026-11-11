import type { PageResult } from '@/features/chapter-translation';
import { MIN_REGION_SIZE_PX } from '../constants/overlay';
import type {
  BlendedStyle,
  DocumentRect,
  DrawnRegion,
  OverlayPageCounts,
  OverlayPagePlan,
  PixelSize
} from '../types/overlay';
import { IsUnchangedTranslation } from './is-unchanged-translation';
import { ListDrawnRegions } from './list-drawn-regions';
import { PlanBlendedRegion } from './plan-blended-region';
import { ScaleRegionBox } from './scale-region-box';

type PageResultInput = Pick<
  PageResult,
  'outcome' | 'image_width_px' | 'image_height_px' | 'regions'
>;

// The counts of the [content] overlay-page log, in its field order (spec 0003
// §12, Planning choice 11).
function CountOverlayPage(
  result: PageResultInput,
  drawn_regions: readonly DrawnRegion[]
): OverlayPageCounts {
  const plans = drawn_regions.flatMap(({ plan }) =>
    plan === null ? [] : [plan]
  );

  return {
    region_count: result.regions.length,
    blended_count: plans.length,
    current_style_count: drawn_regions.length - plans.length,
    unchanged_count:
      result.outcome === 'already_in_target_language'
        ? 0
        : result.regions.filter(region =>
            IsUnchangedTranslation(region.source_text, region.translated_text)
          ).length,
    label_count: plans.filter(plan => plan.kind === 'label').length,
    blur_count: plans.filter(plan => plan.patch?.kind === 'blur').length,
    tint_count: plans.filter(plan => plan.patch?.kind === 'tint').length,
    overflow_count: plans.filter(plan => plan.text.is_overflowing).length
  };
}

// Plans every drawn region of a page, in order (spec 0003 §8.1–§8.2). A region
// without appearance keeps today's style (`plan: null`). A region with
// appearance waits for the font: it is left out while `blended_style` is null.
export function PlanOverlayPage(
  input: {
    result: PageResultInput;
    content_size: PixelSize;
    blended_style: BlendedStyle | null;
  },
  dependencies = { ReadNowMs: () => performance.now() }
): OverlayPagePlan {
  const started_at_ms = dependencies.ReadNowMs();
  const { result, content_size, blended_style } = input;
  const natural_size: PixelSize = {
    width_px: result.image_width_px,
    height_px: result.image_height_px
  };
  const content_rect: DocumentRect = { left_px: 0, top_px: 0, ...content_size };
  const drawn_regions = ListDrawnRegions(result).flatMap(
    (region): DrawnRegion[] => {
      const region_rect = ScaleRegionBox(
        region.bbox_px,
        natural_size,
        content_rect
      );

      if (
        region_rect.width_px < MIN_REGION_SIZE_PX ||
        region_rect.height_px < MIN_REGION_SIZE_PX
      ) {
        return [];
      }

      if (!region.appearance) return [{ region, region_rect, plan: null }];

      if (blended_style === null) return [];

      const text = region.translated_text ?? region.source_text;

      return [
        {
          region,
          region_rect,
          plan: PlanBlendedRegion({
            appearance: region.appearance,
            bbox_px: region.bbox_px,
            kind: region.kind,
            natural_size,
            content_size,
            font: blended_style.font,
            is_blur_supported: blended_style.is_blur_supported,
            MeasureTextHeight: (width_px, font_size_px) =>
              blended_style.MeasureText(text, width_px, font_size_px),
            MeasureWidestWordWidth: font_size_px =>
              blended_style.MeasureWidestWord(text, font_size_px)
          })
        }
      ];
    }
  );

  return {
    drawn_regions,
    counts: CountOverlayPage(result, drawn_regions),
    plan_ms: Math.round(dependencies.ReadNowMs() - started_at_ms)
  };
}
