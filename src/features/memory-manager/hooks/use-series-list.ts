import { ListSeries } from '@/features/memory';
import type { SeriesRecord } from '@/services/database';
import { useCallback, useEffect, useRef, useState } from 'react';

const LIST_FAILED_MESSAGE = "Couldn't load your series. Reload the page.";

export function UseSeriesList() {
  const [series_list, set_series_list] = useState<SeriesRecord[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error_message, set_error_message] = useState<string | null>(null);
  const request_count_ref = useRef(0);

  const Reload = useCallback(async (): Promise<void> => {
    const request_id = ++request_count_ref.current;

    try {
      const next_series_list = await ListSeries();

      if (request_id !== request_count_ref.current) return;

      set_series_list(next_series_list);
      set_error_message(null);
    } catch {
      if (request_id !== request_count_ref.current) return;

      console.error('[options] list-series', { outcome: 'failed' });
      set_error_message(LIST_FAILED_MESSAGE);
    } finally {
      if (request_id === request_count_ref.current) set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    void Reload();
  }, [Reload]);

  return { series_list, is_loading, error_message, Reload };
}
