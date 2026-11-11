import type { PageJobStatus, PageResult } from '@/features/chapter-translation';
import type { TargetLanguage } from '@/types/target-language';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OVERLAY_TYPOGRAPHY } from '../constants/overlay';
import { UseContentRects } from '../hooks/use-content-rects';
import { UseOverlayFont } from '../hooks/use-overlay-font';
import {
  CreateTextMeasurer,
  CreateWidestWordMeasurer
} from '../lib/create-text-measurer';
import { PlanOverlayPage } from '../lib/plan-overlay-page';
import { ReadIsBlurSupported } from '../lib/read-is-blur-supported';
import { ResolvePageBadge } from '../lib/resolve-page-badge';
import type {
  BlendedStyle,
  DocumentRect,
  DrawnRegion,
  OverlayFont
} from '../types/overlay';
import { BlendedRegion, BlendedRegionPatch } from './blended-region';
import { PageStatusBadge } from './page-status-badge';
import { RegionBox } from './region-box';

export type OverlayPage = {
  page_id: string;
  page_index: number;
  element: HTMLImageElement;
  job_status: PageJobStatus | null;
  result: PageResult | null;
};

type OverlayLayerProps = {
  pages: OverlayPage[];
  target_language: TargetLanguage;
  is_showing_original: boolean;
  original_region_keys: ReadonlySet<string>;
  OnRetryPage: (page_index: number) => void;
  OnToggleRegion: (region_key: string) => void;
};

type TextMeasurer = (
  text: string,
  width_px: number,
  font_size_px: number
) => number;

type LoggedPlan = { result: PageResult; font: OverlayFont };

type DrawnRegionElementProps = {
  drawn_region: DrawnRegion;
  region_key: string;
  origin: DocumentRect;
  target_language: TargetLanguage;
  is_original: boolean;
  MeasureText: TextMeasurer;
  OnToggle: () => void;
};

type PageRegionsProps = {
  page_id: string;
  drawn_regions: DrawnRegion[];
  content_rect: DocumentRect;
  target_language: TargetLanguage;
  original_region_keys: ReadonlySet<string>;
  patch_layer_element: HTMLDivElement | null;
  MeasureText: TextMeasurer;
  OnToggleRegion: (region_key: string) => void;
};

type PageOverlayProps = {
  page: OverlayPage;
  content_rect: DocumentRect;
  target_language: TargetLanguage;
  is_showing_original: boolean;
  original_region_keys: ReadonlySet<string>;
  blended_style: BlendedStyle | null;
  patch_layer_element: HTMLDivElement | null;
  MeasureText: TextMeasurer | null;
  OnRetryPage: (page_index: number) => void;
  OnToggleRegion: (region_key: string) => void;
};

const OVERLAY_PAGE_LOG_EVENT = '[content] overlay-page';

function OffsetRect(rect: DocumentRect, origin: DocumentRect): DocumentRect {
  return {
    ...rect,
    left_px: origin.left_px + rect.left_px,
    top_px: origin.top_px + rect.top_px
  };
}

function DrawnRegionElement({
  drawn_region,
  region_key,
  origin,
  target_language,
  is_original,
  MeasureText,
  OnToggle
}: DrawnRegionElementProps) {
  const { region, region_rect, plan } = drawn_region;
  const text = region.translated_text ?? region.source_text;
  const rect = OffsetRect(region_rect, origin);

  if (!plan) {
    return (
      <RegionBox
        region_key={region_key}
        rect={rect}
        text={text}
        is_original={is_original}
        MeasureTextHeight={font_size_px =>
          MeasureText(text, rect.width_px, font_size_px)
        }
        OnToggle={OnToggle}
      />
    );
  }

  return (
    <BlendedRegion
      region_key={region_key}
      text={text}
      target_language={target_language}
      text_plan={plan.text}
      region_rect={rect}
      origin={origin}
      is_original={is_original}
      OnToggle={OnToggle}
    />
  );
}

function PageRegions({
  page_id,
  drawn_regions,
  content_rect,
  target_language,
  original_region_keys,
  patch_layer_element,
  MeasureText,
  OnToggleRegion
}: PageRegionsProps) {
  const patches = drawn_regions.flatMap(({ region, plan }) => {
    const region_key = `${page_id}:${region.region_id}`;

    return plan?.patch && !original_region_keys.has(region_key)
      ? [
          <BlendedRegionPatch
            key={region_key}
            patch={plan.patch}
            origin={content_rect}
          />
        ]
      : [];
  });

  return (
    <>
      {drawn_regions.map(drawn_region => {
        const region_key = `${page_id}:${drawn_region.region.region_id}`;

        return (
          <DrawnRegionElement
            key={region_key}
            drawn_region={drawn_region}
            region_key={region_key}
            origin={content_rect}
            target_language={target_language}
            is_original={original_region_keys.has(region_key)}
            MeasureText={MeasureText}
            OnToggle={() => OnToggleRegion(region_key)}
          />
        );
      })}
      {patch_layer_element ? createPortal(patches, patch_layer_element) : null}
    </>
  );
}

function PageOverlay({
  page,
  content_rect,
  target_language,
  is_showing_original,
  original_region_keys,
  blended_style,
  patch_layer_element,
  MeasureText,
  OnRetryPage,
  OnToggleRegion
}: PageOverlayProps) {
  const page_plan = useMemo(
    () =>
      page.result
        ? PlanOverlayPage({
            result: page.result,
            content_size: {
              width_px: content_rect.width_px,
              height_px: content_rect.height_px
            },
            blended_style
          })
        : null,
    [page.result, content_rect.width_px, content_rect.height_px, blended_style]
  );
  const logged_plan_ref = useRef<LoggedPlan | null>(null);

  // Logs once for each page result and font (spec 0003 §12), and not again
  // when a resize plans the page anew.
  useEffect(() => {
    if (!page.result || !page_plan || !blended_style) return;

    const logged_plan = logged_plan_ref.current;

    if (
      logged_plan?.result === page.result &&
      logged_plan.font === blended_style.font
    ) {
      return;
    }

    logged_plan_ref.current = { result: page.result, font: blended_style.font };
    console.info(OVERLAY_PAGE_LOG_EVENT, {
      page_index: page.page_index,
      ...page_plan.counts,
      plan_ms: page_plan.plan_ms
    });
  }, [page.page_index, page.result, page_plan, blended_style]);

  const badge = ResolvePageBadge({
    job_status: page.job_status,
    outcome: page.result?.outcome ?? null,
    target_language
  });

  return (
    <div>
      {badge ? (
        <PageStatusBadge
          rect={content_rect}
          badge={badge}
          page_index={page.page_index}
          OnRetry={() => OnRetryPage(page.page_index)}
        />
      ) : null}
      {page_plan && MeasureText && !is_showing_original ? (
        <PageRegions
          page_id={page.page_id}
          drawn_regions={page_plan.drawn_regions}
          content_rect={content_rect}
          target_language={target_language}
          original_region_keys={original_region_keys}
          patch_layer_element={patch_layer_element}
          MeasureText={MeasureText}
          OnToggleRegion={OnToggleRegion}
        />
      ) : null}
    </div>
  );
}

export function OverlayLayer({
  pages,
  target_language,
  is_showing_original,
  original_region_keys,
  OnRetryPage,
  OnToggleRegion
}: OverlayLayerProps) {
  const [container_element, set_container_element] =
    useState<HTMLDivElement | null>(null);
  const [patch_layer_element, set_patch_layer_element] =
    useState<HTMLDivElement | null>(null);
  const font_status = UseOverlayFont();
  const MeasureText = useMemo(
    () => (container_element ? CreateTextMeasurer(container_element) : null),
    [container_element]
  );
  const MeasureBlendedText = useMemo(
    () =>
      container_element && font_status !== 'loading'
        ? CreateTextMeasurer(container_element, {
            typography: OVERLAY_TYPOGRAPHY[font_status],
            lang: target_language
          })
        : null,
    [container_element, font_status, target_language]
  );
  const MeasureWidestWord = useMemo(
    () =>
      container_element && font_status !== 'loading'
        ? CreateWidestWordMeasurer(container_element, {
            typography: OVERLAY_TYPOGRAPHY[font_status],
            lang: target_language
          })
        : null,
    [container_element, font_status, target_language]
  );
  const blended_style = useMemo<BlendedStyle | null>(
    () =>
      font_status !== 'loading' && MeasureBlendedText && MeasureWidestWord
        ? {
            font: font_status,
            is_blur_supported: ReadIsBlurSupported(),
            MeasureText: MeasureBlendedText,
            MeasureWidestWord
          }
        : null,
    [font_status, MeasureBlendedText, MeasureWidestWord]
  );
  const elements = useMemo(
    () => new Map(pages.map(page => [page.page_id, page.element])),
    [pages]
  );
  const content_rects = UseContentRects(elements);

  return (
    <div
      ref={set_container_element}
      className="pointer-events-none absolute top-0 left-0"
      aria-label="Manga translations"
    >
      <div
        ref={set_patch_layer_element}
        className="pointer-events-none absolute top-0 left-0"
        aria-hidden="true"
      />
      <div>
        {pages.map(page => {
          const content_rect = content_rects.get(page.page_id);

          if (!content_rect) return null;

          return (
            <PageOverlay
              key={page.page_id}
              page={page}
              content_rect={content_rect}
              target_language={target_language}
              is_showing_original={is_showing_original}
              original_region_keys={original_region_keys}
              blended_style={blended_style}
              patch_layer_element={patch_layer_element}
              MeasureText={MeasureText}
              OnRetryPage={OnRetryPage}
              OnToggleRegion={OnToggleRegion}
            />
          );
        })}
      </div>
    </div>
  );
}
