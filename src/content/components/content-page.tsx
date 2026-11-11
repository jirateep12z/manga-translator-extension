import {
  FormatPreloadStatus,
  IsFiniteChapterNumber,
  ReadChapterControls,
  ResolvePreloadStartRefusal,
  SelectNextChapterControl,
  type CancelChapterPreloadMessage,
  type ChapterPreloadStatus,
  type GetPreloadTabRoleMessage,
  type PreloadCommandTarget,
  type RequestChapterPreloadMessage
} from '@/features/chapter-preload';
import {
  FormatChapterLabel,
  ResolvePanelVisibility,
  type OpenOptionsPageMessage,
  type SeriesState,
  type TabCommandTarget
} from '@/features/chapter-translation';
import {
  FloatingPanel,
  SeriesConfirmationCard,
  UseChapterTranslation,
  UseSeriesState
} from '@/features/chapter-translation/ui';
import { OverlayLayer, type OverlayPage } from '@/features/overlay';
import { PreloadLazyPages, type PageScanner } from '@/features/page-scanner';
import { UseScannedPages } from '@/features/page-scanner/ui';
import { ExtractPageInfo } from '@/features/series-detection';
import { DEFAULT_SETTINGS, type PublicSettings } from '@/features/settings';
import { UseTheme } from '@/features/theme/ui';
import { IsRecord } from '@/lib/is-record';
import { SendRuntimeMessage } from '@/lib/messaging';
import type { TargetLanguage } from '@/types/target-language';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShadowHost } from '../lib/create-shadow-host';
import { IsPageTurnWithinChapter } from '../lib/is-page-turn-within-chapter';
import {
  MergePendingStart,
  ResolvePreloadFollowUp,
  type PreloadStartRequest
} from '../lib/preload-start-request';
import { ResolveAutoStartMode } from '../lib/resolve-auto-start-mode';
import { ShouldCancelChapterPreload } from '../lib/should-cancel-chapter-preload';
import { ShouldRequestChapterPreload } from '../lib/should-request-chapter-preload';
import { WatchUrlChanges } from '../services/watch-url-changes.service';

type ConfirmationMode = 'confirm' | 'choose';

type ContentPageProps = {
  public_settings: PublicSettings | null;
  scanner: PageScanner;
  shadow_host: ShadowHost;
  RegisterTabCommandTarget: (target: TabCommandTarget | null) => void;
  RegisterPreloadCommandTarget: (target: PreloadCommandTarget | null) => void;
  UpdateTargetLanguage: (target_language: TargetLanguage) => void;
};

function ResolveHeaderText(series_state: SeriesState | null): string {
  if (series_state?.status === 'bound') {
    return `${series_state.canonical_title} · ${FormatChapterLabel(series_state.chapter_number)}`;
  }

  if (series_state?.status === 'unlinked') {
    return series_state.detected_title === ''
      ? 'Not linked'
      : `Not linked — detected: ${series_state.detected_title}`;
  }

  return 'Manga Translator';
}

function OpenOptionsPage(): void {
  const message: OpenOptionsPageMessage = { action: 'open-options-page' };

  SendRuntimeMessage(message).catch((error: unknown) => {
    console.warn('[content] open-options-page', { outcome: 'failed', error });
  });
}

// A failed question counts as a normal tab, so auto-start still works when
// the background cannot answer.
async function ReadIsPreloadTab(): Promise<boolean> {
  try {
    const response = await SendRuntimeMessage<unknown>({
      action: 'get-preload-tab-role'
    } satisfies GetPreloadTabRoleMessage);

    return IsRecord(response) && response.is_preload_tab === true;
  } catch (error) {
    console.warn('[content] get-preload-tab-role', {
      outcome: 'failed',
      error
    });

    return false;
  }
}

// A failed send never affects the run (spec 0006 §4.4).
function SendChapterPreloadMessage(
  message: RequestChapterPreloadMessage | CancelChapterPreloadMessage
): void {
  SendRuntimeMessage(message).catch((error: unknown) => {
    console.warn('[content] chapter-preload', {
      action: message.action,
      outcome: 'failed',
      error
    });
  });
}

export function ContentPage({
  public_settings,
  scanner,
  shadow_host,
  RegisterTabCommandTarget,
  RegisterPreloadCommandTarget,
  UpdateTargetLanguage
}: ContentPageProps) {
  const pages = UseScannedPages(scanner);
  const [page_info, set_page_info] = useState(() =>
    ExtractPageInfo(document, location)
  );
  const {
    series_state,
    series_page_url,
    all_series,
    is_submitting,
    is_auto_translate_saving,
    confirm_error_message,
    DetectSeries,
    LoadAllSeries,
    ConfirmExistingSeries,
    CreateNewSeries,
    SetAutoTranslate
  } = UseSeriesState({ page_info, has_candidates: pages.length > 0 });
  const target_language =
    public_settings?.target_language ?? DEFAULT_SETTINGS.target_language;
  const {
    queue_state,
    page_results,
    cached_page_count,
    has_cached_translations,
    Start,
    Pause,
    Resume,
    Stop,
    RetryPage,
    Reset
  } = UseChapterTranslation({
    scanner,
    pages,
    series_state,
    target_language,
    page_hostname: location.hostname,
    page_url: location.href,
    SetHostHidden: shadow_host.SetHidden
  });
  const [wrapper_element, set_wrapper_element] =
    useState<HTMLDivElement | null>(null);
  const [is_expanded, set_is_expanded] = useState(false);
  const [is_showing_original, set_is_showing_original] = useState(false);
  const [original_region_keys, set_original_region_keys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [confirmation_mode, set_confirmation_mode] =
    useState<ConfirmationMode | null>(null);
  // The start request that waits for the user to confirm a series.
  const pending_start_ref = useRef<boolean | null>(null);
  const series_state_ref = useRef(series_state);
  const page_info_ref = useRef(page_info);
  // page_info.url drops the query, so the full chapter URL is kept here.
  const chapter_url_ref = useRef(location.href);
  const is_preloading_ref = useRef(false);
  // The chapter URL that already started a run, automatic or manual, so an
  // automatic run starts at most once per chapter (spec 0005 §7.2).
  const auto_started_url_ref = useRef<string | null>(null);
  // A start requested while a preload runs; it follows that preload.
  const pending_start_request_ref = useRef<PreloadStartRequest | null>(null);
  // The chapter URL where the checkbox turned auto-translate on. That chapter
  // is not translated by the change (spec 0005 §1.7 non-goals).
  const auto_translate_enabled_url_ref = useRef<string | null>(null);
  const [is_tab_visible, set_is_tab_visible] = useState(
    () => document.visibilityState === 'visible'
  );
  // Whether the background drives this tab as a preload tab, per page URL.
  // Asked again after a chapter change, since a session can end meanwhile.
  const [preload_tab_role, set_preload_tab_role] = useState<{
    page_url: string;
    is_preload_tab: boolean;
  } | null>(null);
  // The latest next-chapter preload status for this tab (spec 0006 §6.3).
  const [preload_status, set_preload_status] =
    useState<ChapterPreloadStatus | null>(null);
  // The queue as of the last effect run, to detect a new start or completion.
  const previous_queue_ref = useRef({
    status: queue_state.status,
    is_cache_only: queue_state.is_cache_only
  });

  UseTheme(public_settings?.theme ?? 'system', wrapper_element);

  useEffect(() => {
    const HandleVisibilityChange = () =>
      set_is_tab_visible(document.visibilityState === 'visible');

    document.addEventListener('visibilitychange', HandleVisibilityChange);

    return () =>
      document.removeEventListener('visibilitychange', HandleVisibilityChange);
  }, []);

  useEffect(() => {
    const role_page_url = page_info.url;
    let is_current = true;

    void ReadIsPreloadTab().then(is_preload_tab => {
      if (is_current) {
        set_preload_tab_role({ page_url: role_page_url, is_preload_tab });
      }
    });

    return () => {
      is_current = false;
    };
  }, [page_info.url]);

  useEffect(() => {
    series_state_ref.current = series_state;
  }, [series_state]);

  useEffect(() => {
    page_info_ref.current = page_info;
  }, [page_info]);

  useEffect(
    () =>
      WatchUrlChanges(next_url => {
        const next_page_info = ExtractPageInfo(document, location);

        // Readers that keep the page number in the path change the URL while
        // the user scrolls through one chapter. The queue keeps running.
        if (
          IsPageTurnWithinChapter({
            previous_url: chapter_url_ref.current,
            next_url,
            previous_chapter_number: page_info_ref.current.chapter_number,
            next_chapter_number: next_page_info.chapter_number
          })
        ) {
          return;
        }

        chapter_url_ref.current = next_url;
        Reset();
        set_preload_status(null);
        auto_started_url_ref.current = null;
        auto_translate_enabled_url_ref.current = null;
        pending_start_ref.current = null;
        set_original_region_keys(new Set());
        set_is_showing_original(false);
        set_confirmation_mode(null);
        set_page_info(next_page_info);
        scanner.Rescan();
      }),
    [Reset, scanner]
  );

  const OpenConfirmation = useCallback(
    (mode: ConfirmationMode) => {
      set_confirmation_mode(mode);
      set_is_expanded(true);
      void LoadAllSeries();
    },
    [LoadAllSeries]
  );

  // Readers that insert page images only near the viewport are scrolled
  // through first, so the run covers pages the user has not scrolled to.
  const StartAfterPreload = useCallback(
    async (
      is_retranslation: boolean,
      bound_state: SeriesState,
      is_cache_only = false
    ): Promise<void> => {
      let request: PreloadStartRequest = {
        is_retranslation,
        bound_state,
        is_cache_only,
        chapter_url: chapter_url_ref.current
      };

      // A preload is already scrolling. The request follows it instead of
      // being dropped, so neither a manual start nor the next chapter's
      // automatic start is lost (spec 0005 §7.2).
      if (is_preloading_ref.current) {
        pending_start_request_ref.current = MergePendingStart(
          pending_start_request_ref.current,
          request
        );

        return;
      }

      is_preloading_ref.current = true;

      try {
        for (;;) {
          try {
            await PreloadLazyPages(scanner);
          } catch (error) {
            console.warn('[content] preload-lazy-pages', {
              outcome: 'failed',
              error
            });
          }

          const follow_up = ResolvePreloadFollowUp({
            own_request: request,
            pending: pending_start_request_ref.current,
            current_chapter_url: chapter_url_ref.current
          });

          pending_start_request_ref.current = null;

          if (follow_up.kind === 'preload') {
            request = follow_up.request;
            continue;
          }

          if (follow_up.kind === 'start') {
            Start(
              follow_up.request.is_retranslation,
              follow_up.request.bound_state,
              follow_up.request.is_cache_only
            );
          }

          return;
        }
      } finally {
        is_preloading_ref.current = false;
      }
    },
    [scanner, Start]
  );

  // A manual start marks the chapter as started before saving the setting,
  // so the saved setting cannot trigger an automatic start (spec 0005 §7.2).
  const StartManually = useCallback(
    (is_retranslation: boolean, bound_state: SeriesState): void => {
      auto_started_url_ref.current = chapter_url_ref.current;
      void StartAfterPreload(is_retranslation, bound_state);

      if (
        bound_state.status === 'bound' &&
        !bound_state.is_auto_translate_enabled
      ) {
        void SetAutoTranslate(bound_state.series_id, true);
      }
    },
    [StartAfterPreload, SetAutoTranslate]
  );

  const HandleStart = useCallback(
    async (is_retranslation: boolean): Promise<void> => {
      let current_state = series_state_ref.current;

      if (
        current_state === null ||
        (current_state.status === 'unlinked' &&
          current_state.is_detection_failed)
      ) {
        current_state = await DetectSeries();
      }

      if (current_state === null) return;

      if (current_state.status === 'bound') {
        StartManually(is_retranslation, current_state);

        return;
      }

      pending_start_ref.current = is_retranslation;
      OpenConfirmation('confirm');
    },
    [DetectSeries, OpenConfirmation, StartManually]
  );

  const HandleConfirmed = useCallback(
    (bound_state: SeriesState | null) => {
      if (bound_state === null) return;

      const pending_start = pending_start_ref.current;

      pending_start_ref.current = null;
      set_confirmation_mode(null);

      if (pending_start !== null) {
        StartManually(pending_start, bound_state);
      }
    },
    [StartManually]
  );

  const is_extension_enabled = public_settings?.is_enabled === true;
  const is_provider_configured =
    public_settings?.is_provider_configured === true;
  const page_count = pages.length;
  const queue_status = queue_state.status;
  const is_preload_tab =
    preload_tab_role?.page_url === page_info.url
      ? preload_tab_role.is_preload_tab
      : null;

  useEffect(() => {
    const auto_start_mode = ResolveAutoStartMode({
      is_extension_enabled,
      is_provider_configured,
      series_state,
      series_page_url,
      current_page_url: page_info.url,
      cached_page_count,
      page_count,
      queue_status,
      is_tab_visible,
      has_auto_started:
        auto_started_url_ref.current === chapter_url_ref.current,
      has_enabled_auto_translate_here:
        auto_translate_enabled_url_ref.current === chapter_url_ref.current,
      is_preload_tab
    });

    if (auto_start_mode === null || series_state?.status !== 'bound') return;

    auto_started_url_ref.current = chapter_url_ref.current;
    console.info('[content] auto-start', {
      mode: auto_start_mode,
      series_id: series_state.series_id,
      chapter_number: series_state.chapter_number
    });
    void StartAfterPreload(
      false,
      series_state,
      auto_start_mode === 'cache-only'
    );
  }, [
    is_extension_enabled,
    is_provider_configured,
    series_state,
    series_page_url,
    page_info.url,
    cached_page_count,
    page_count,
    queue_status,
    is_tab_visible,
    is_preload_tab,
    StartAfterPreload
  ]);

  // A full run that starts here stops the series' preload session, and one
  // that completes here starts the next one (spec 0006 §4.4).
  useEffect(() => {
    const previous_queue = previous_queue_ref.current;
    const current_queue = {
      status: queue_state.status,
      is_cache_only: queue_state.is_cache_only,
      is_preload: queue_state.is_preload,
      series_id: queue_state.series_id,
      chapter_number: queue_state.chapter_number
    };

    previous_queue_ref.current = {
      status: current_queue.status,
      is_cache_only: current_queue.is_cache_only
    };

    const canceled_series_id = ShouldCancelChapterPreload(
      previous_queue,
      current_queue
    );

    if (canceled_series_id !== null) {
      SendChapterPreloadMessage({
        action: 'cancel-chapter-preload',
        series_id: canceled_series_id
      });
    }

    if (
      ShouldRequestChapterPreload({
        previous_status: previous_queue.status,
        queue_state: current_queue,
        series_state
      }) &&
      current_queue.series_id !== null &&
      current_queue.chapter_number !== null
    ) {
      SendChapterPreloadMessage({
        action: 'request-chapter-preload',
        series_id: current_queue.series_id,
        chapter_number: current_queue.chapter_number
      });
    }
  }, [
    queue_state.status,
    queue_state.is_cache_only,
    queue_state.is_preload,
    queue_state.series_id,
    queue_state.chapter_number,
    series_state
  ]);

  // Checking the box only saves the setting; the current chapter is not
  // translated because of it (spec 0005 §1.7 non-goals). Unchecking also
  // stops the series' preload session (spec 0006 §4.4).
  const HandleAutoTranslateChange = useCallback(
    (is_auto_translate_enabled: boolean) => {
      if (series_state?.status !== 'bound') return;

      if (is_auto_translate_enabled) {
        auto_translate_enabled_url_ref.current = chapter_url_ref.current;
      } else {
        SendChapterPreloadMessage({
          action: 'cancel-chapter-preload',
          series_id: series_state.series_id
        });
      }

      void SetAutoTranslate(series_state.series_id, is_auto_translate_enabled);
    },
    [series_state, SetAutoTranslate]
  );

  const HandleCancelConfirmation = useCallback(() => {
    pending_start_ref.current = null;
    set_confirmation_mode(null);
  }, []);

  const HandleToggleRegion = useCallback((region_key: string) => {
    set_original_region_keys(previous_keys => {
      const next_keys = new Set(previous_keys);

      if (!next_keys.delete(region_key)) next_keys.add(region_key);

      return next_keys;
    });
  }, []);

  // `pages` changes when the reader recreates page elements, so overlays move
  // to the new elements instead of staying on detached ones.
  const overlay_pages = useMemo(() => {
    const scanned_page_ids = new Set(pages.map(page => page.page_id));

    return queue_state.jobs.flatMap((job): OverlayPage[] => {
      const element = scanned_page_ids.has(job.page_id)
        ? scanner.GetElement(job.page_id)
        : null;

      if (!element) return [];

      return [
        {
          page_id: job.page_id,
          page_index: job.page_index,
          element,
          job_status: job.status,
          result: page_results.get(job.page_id) ?? null
        }
      ];
    });
  }, [queue_state.jobs, page_results, scanner, pages]);

  const latest_ref = useRef({
    pages,
    series_state,
    series_page_url,
    page_url: page_info.url,
    has_cached_translations,
    is_extension_enabled,
    is_provider_configured,
    queue_status: queue_state.status,
    is_cache_only: queue_state.is_cache_only,
    is_preload: queue_state.is_preload,
    HandleStart,
    OpenConfirmation,
    Start
  });

  useEffect(() => {
    latest_ref.current = {
      pages,
      series_state,
      series_page_url,
      page_url: page_info.url,
      has_cached_translations,
      is_extension_enabled,
      is_provider_configured,
      queue_status: queue_state.status,
      is_cache_only: queue_state.is_cache_only,
      is_preload: queue_state.is_preload,
      HandleStart,
      OpenConfirmation,
      Start
    };
  });

  // Commands from the background's preload session (spec 0006 §4.2, §5.4).
  useEffect(() => {
    const target: PreloadCommandTarget = {
      GoToNextChapter: () => {
        const { series_state: current_state } = latest_ref.current;

        if (
          current_state?.status !== 'bound' ||
          !IsFiniteChapterNumber(current_state.chapter_number)
        ) {
          return false;
        }

        // Links resolve against <base href> when the page has one.
        const { controls, elements } = ReadChapterControls(
          document,
          shadow_host.host_element,
          document.baseURI
        );
        const selection = SelectNextChapterControl({
          controls,
          current_url: location.href,
          current_chapter_number: current_state.chapter_number
        });

        console.info('[content] go-to-next-chapter', {
          rule: selection?.rule ?? null,
          tag: selection ? controls[selection.control_index].tag : null
        });

        if (!selection) return false;

        elements[selection.control_index].click();

        return true;
      },
      StartPreloadTranslation: () => {
        const latest = latest_ref.current;
        const bound_state =
          latest.series_state?.status === 'bound' ? latest.series_state : null;
        const refusal = ResolvePreloadStartRefusal({
          is_extension_enabled: latest.is_extension_enabled,
          is_provider_configured: latest.is_provider_configured,
          is_series_bound: bound_state !== null,
          is_auto_translate_enabled:
            bound_state?.is_auto_translate_enabled === true,
          series_page_url: latest.series_page_url,
          page_url: latest.page_url,
          page_count: latest.pages.length,
          queue_status: latest.queue_status
        });

        if (refusal !== null || bound_state === null) {
          console.info('[content] start-preload-translation', {
            outcome: 'refused',
            refusal
          });

          return refusal ?? 'series-not-bound';
        }

        // No lazy-page scroll and no auto-start record: the tab is hidden.
        latest.Start(false, bound_state, false, true);

        return null;
      },
      ShowPreloadStatus: set_preload_status,
      ReleasePreloadTab: () =>
        set_preload_tab_role({
          page_url: latest_ref.current.page_url,
          is_preload_tab: false
        })
    };

    RegisterPreloadCommandTarget(target);

    return () => RegisterPreloadCommandTarget(null);
  }, [RegisterPreloadCommandTarget, shadow_host]);

  useEffect(() => {
    RegisterTabCommandTarget({
      ReadPageStatus: () => {
        const latest = latest_ref.current;
        const bound_state =
          latest.series_state?.status === 'bound' ? latest.series_state : null;

        return {
          is_available: true,
          series: bound_state
            ? {
                series_id: bound_state.series_id,
                canonical_title: bound_state.canonical_title
              }
            : null,
          chapter_number: latest.series_state?.chapter_number ?? null,
          page_count: latest.pages.length,
          has_cached_translations: latest.has_cached_translations,
          page_url: latest.page_url,
          series_page_url: latest.series_page_url,
          queue_status: latest.queue_status,
          is_preload_run: latest.is_preload
        };
      },
      StartChapterTranslation: is_retranslation => {
        const latest = latest_ref.current;

        const is_full_run_active =
          (latest.queue_status === 'translating' ||
            latest.queue_status === 'paused') &&
          !latest.is_cache_only;

        // A full run may replace a cache-only run (spec 0005 §6.3).
        if (latest.pages.length === 0 || is_full_run_active) {
          return false;
        }

        set_is_expanded(true);
        void latest.HandleStart(is_retranslation);

        return true;
      },
      OpenSeriesPicker: () => {
        const latest = latest_ref.current;

        if (latest.pages.length === 0) return false;

        latest.OpenConfirmation('choose');

        return true;
      }
    });

    return () => RegisterTabCommandTarget(null);
  }, [RegisterTabCommandTarget]);

  // An open confirmation or an active run keeps the panel visible, so a
  // popup command on a page with few images still shows its result.
  const is_panel_visible =
    ResolvePanelVisibility({
      is_enabled: public_settings?.is_enabled === true,
      page_count: pages.length,
      is_series_bound: series_state?.status === 'bound',
      has_chapter_number: page_info.chapter_number !== null
    }) ||
    confirmation_mode !== null ||
    queue_state.status !== 'idle';
  // A status from a session that this chapter did not start is not shown.
  const preload_status_text =
    preload_status !== null &&
    series_state?.status === 'bound' &&
    preload_status.series_id === series_state.series_id &&
    preload_status.source_chapter_number === series_state.chapter_number
      ? FormatPreloadStatus(preload_status)
      : null;
  const is_overlay_visible =
    page_results.size > 0 ||
    queue_state.jobs.some(
      job => job.status === 'in_flight' || job.status === 'failed'
    );
  const confirmation =
    confirmation_mode === null ? null : (
      <SeriesConfirmationCard
        mode={confirmation_mode}
        detected_title={
          series_state?.detected_title ?? page_info.title_candidates[0] ?? ''
        }
        chapter_number={
          series_state?.chapter_number ?? page_info.chapter_number ?? ''
        }
        candidates={
          series_state?.status === 'unlinked' ? series_state.candidates : []
        }
        all_series={all_series}
        is_submitting={is_submitting}
        error_message={confirm_error_message}
        OnCancel={HandleCancelConfirmation}
        OnConfirmExisting={(series_id, chapter_number) =>
          void ConfirmExistingSeries(series_id, chapter_number).then(
            HandleConfirmed
          )
        }
        OnCreateNew={(new_title, chapter_number) =>
          void CreateNewSeries(new_title, chapter_number).then(HandleConfirmed)
        }
      />
    );

  return (
    <div ref={set_wrapper_element} className="text-foreground font-sans">
      {is_overlay_visible ? (
        <OverlayLayer
          pages={overlay_pages}
          target_language={target_language}
          is_showing_original={is_showing_original}
          original_region_keys={original_region_keys}
          OnRetryPage={page_index => void RetryPage(page_index)}
          OnToggleRegion={HandleToggleRegion}
        />
      ) : null}
      {is_panel_visible ? (
        <FloatingPanel
          is_expanded={is_expanded}
          header_text={ResolveHeaderText(series_state)}
          queue_state={queue_state}
          target_language={target_language}
          has_cached_translations={has_cached_translations}
          is_showing_original={is_showing_original}
          preload_status_text={preload_status_text}
          is_provider_configured={
            public_settings?.is_provider_configured === true
          }
          auto_translate={
            series_state?.status === 'bound'
              ? {
                  is_enabled: series_state.is_auto_translate_enabled,
                  is_saving: is_auto_translate_saving
                }
              : null
          }
          confirmation={confirmation}
          OnAutoTranslateChange={HandleAutoTranslateChange}
          OnExpandedChange={set_is_expanded}
          OnOpenSettings={OpenOptionsPage}
          OnPause={Pause}
          OnResume={Resume}
          OnShowOriginalChange={set_is_showing_original}
          OnStart={is_retranslation => void HandleStart(is_retranslation)}
          OnStop={Stop}
          OnTargetLanguageChange={UpdateTargetLanguage}
        />
      ) : null}
    </div>
  );
}
