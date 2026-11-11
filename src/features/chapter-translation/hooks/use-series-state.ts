import type {
  ConfirmSeriesMessage,
  ConfirmSeriesResponse,
  DetectSeriesMessage,
  DetectSeriesResponse,
  ListSeriesMessage,
  ListSeriesResponse,
  PageInfo
} from '@/features/series-detection';
import { SendRuntimeMessage } from '@/lib/messaging';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ToSeriesState } from '../lib/to-series-state';
import type {
  SetSeriesAutoTranslateMessage,
  SetSeriesAutoTranslateResponse
} from '../types/series-auto-translate';
import type { SeriesListItem, SeriesState } from '../types/series-state';

const CONFIRM_FAILED_MESSAGE = 'Unable to link this series. Try again.';

type SeriesTarget = { series_id: string } | { new_title: string };

// A series state together with the page URL it was resolved for. After a
// chapter change, the previous state stays for one render; the URL lets
// callers tell it apart (spec 0005 §4.1).
type ResolvedSeries = { series_state: SeriesState; page_url: string };

export function UseSeriesState(input: {
  page_info: PageInfo;
  has_candidates: boolean;
}) {
  const { page_info, has_candidates } = input;
  const [resolved_series, set_resolved_series] =
    useState<ResolvedSeries | null>(null);
  const [all_series, set_all_series] = useState<SeriesListItem[]>([]);
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_auto_translate_saving, set_is_auto_translate_saving] =
    useState(false);
  const [confirm_error_message, set_confirm_error_message] = useState<
    string | null
  >(null);
  const current_url_ref = useRef(page_info.url);
  const series_state = resolved_series?.series_state ?? null;
  const series_page_url = resolved_series?.page_url ?? null;

  useEffect(() => {
    current_url_ref.current = page_info.url;
    set_resolved_series(null);
    set_confirm_error_message(null);
  }, [page_info.url]);

  const DetectSeries = useCallback(async (): Promise<SeriesState | null> => {
    const requested_url = page_info.url;
    let response: DetectSeriesResponse;

    const message: DetectSeriesMessage = { action: 'detect-series', page_info };

    try {
      response = await SendRuntimeMessage<DetectSeriesResponse>(message);

      if (response.status === 'error') {
        console.warn('[content] detect-series', {
          outcome: 'failed',
          error: response.error
        });
      }
    } catch (error) {
      console.warn('[content] detect-series', { outcome: 'failed', error });
      response = { status: 'error', error: String(error) };
    }

    if (current_url_ref.current !== requested_url) return null;

    const next_state = ToSeriesState(response, page_info);

    set_resolved_series({ series_state: next_state, page_url: requested_url });

    return next_state;
  }, [page_info]);

  useEffect(() => {
    if (has_candidates) void DetectSeries();
  }, [has_candidates, DetectSeries]);

  const LoadAllSeries = useCallback(async (): Promise<void> => {
    try {
      const response = await SendRuntimeMessage<ListSeriesResponse>({
        action: 'list-series'
      } satisfies ListSeriesMessage);

      set_all_series(response.series);
    } catch {
      set_all_series([]);
    }
  }, []);

  const SubmitConfirmation = useCallback(
    async (
      target: SeriesTarget,
      chapter_number: string
    ): Promise<SeriesState | null> => {
      const trimmed_chapter_number = chapter_number.trim();

      const message: ConfirmSeriesMessage = {
        action: 'confirm-series',
        page_info,
        detected_title: series_state?.detected_title ?? '',
        chapter_number: trimmed_chapter_number,
        ...target
      };

      const requested_url = page_info.url;

      set_is_submitting(true);

      try {
        const response =
          await SendRuntimeMessage<ConfirmSeriesResponse>(message);

        // A chapter change during the request must not bind the new page.
        if (current_url_ref.current !== requested_url) return null;

        if (!response.success) {
          set_confirm_error_message(response.error || CONFIRM_FAILED_MESSAGE);

          return null;
        }

        const bound_state: SeriesState = {
          status: 'bound',
          series_id: response.series.series_id,
          canonical_title: response.series.canonical_title,
          chapter_number: trimmed_chapter_number,
          detected_title: series_state?.detected_title ?? '',
          is_auto_translate_enabled:
            response.series.is_auto_translate_enabled === true
        };

        set_resolved_series({
          series_state: bound_state,
          page_url: requested_url
        });
        set_confirm_error_message(null);

        return bound_state;
      } catch {
        set_confirm_error_message(CONFIRM_FAILED_MESSAGE);

        return null;
      } finally {
        set_is_submitting(false);
      }
    },
    [page_info, series_state]
  );

  const ConfirmExistingSeries = useCallback(
    (series_id: string, chapter_number: string) =>
      SubmitConfirmation({ series_id: series_id.trim() }, chapter_number),
    [SubmitConfirmation]
  );

  const CreateNewSeries = useCallback(
    (new_title: string, chapter_number: string) =>
      SubmitConfirmation({ new_title: new_title.trim() }, chapter_number),
    [SubmitConfirmation]
  );

  // The caller passes the bound series it holds, so no stale render state is
  // read (spec 0005 §7.3).
  const SetAutoTranslate = useCallback(
    async (
      series_id: string,
      is_auto_translate_enabled: boolean
    ): Promise<void> => {
      const requested_url = current_url_ref.current;
      const log_fields = { series_id, is_auto_translate_enabled };
      const message: SetSeriesAutoTranslateMessage = {
        action: 'set-series-auto-translate',
        series_id,
        is_auto_translate_enabled
      };

      set_is_auto_translate_saving(true);

      try {
        const response =
          await SendRuntimeMessage<SetSeriesAutoTranslateResponse>(message);

        if (!response.success) {
          console.warn('[content] set-series-auto-translate', {
            ...log_fields,
            outcome: 'failed'
          });

          return;
        }

        set_resolved_series(previous => {
          if (
            previous?.series_state.status !== 'bound' ||
            previous.series_state.series_id !== series_id ||
            previous.page_url !== requested_url
          ) {
            return previous;
          }

          return {
            ...previous,
            series_state: {
              ...previous.series_state,
              is_auto_translate_enabled: response.is_auto_translate_enabled
            }
          };
        });
        console.info('[content] set-series-auto-translate', {
          ...log_fields,
          outcome: 'saved'
        });
      } catch (error) {
        console.warn('[content] set-series-auto-translate', {
          ...log_fields,
          outcome: 'failed',
          error
        });
      } finally {
        set_is_auto_translate_saving(false);
      }
    },
    []
  );

  return {
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
  };
}
