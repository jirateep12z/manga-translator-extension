import {
  ListBindingsBySeries,
  ListChapters,
  ListEntities,
  ReadSeries
} from '@/features/memory';
import type {
  ChapterRecord,
  EntityRecord,
  SeriesRecord,
  SiteBindingRecord
} from '@/services/database';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOAD_FAILED_MESSAGE = "Couldn't load this series. Reload the page.";

type SeriesMemory = {
  series: SeriesRecord | null;
  entities: EntityRecord[];
  chapters: ChapterRecord[];
  bindings: SiteBindingRecord[];
};

const EMPTY_SERIES_MEMORY: SeriesMemory = {
  series: null,
  entities: [],
  chapters: [],
  bindings: []
};

export function UseSeriesMemory(series_id: string | null) {
  const [memory, set_memory] = useState<SeriesMemory>(EMPTY_SERIES_MEMORY);
  const [is_loading, set_is_loading] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  // Results for a series that is no longer selected are discarded.
  const request_count_ref = useRef(0);

  const Reload = useCallback(async (): Promise<void> => {
    const request_id = ++request_count_ref.current;

    if (series_id === null) {
      set_memory(EMPTY_SERIES_MEMORY);
      set_is_loading(false);
      set_error_message(null);

      return;
    }

    set_is_loading(true);

    try {
      const [series, entities, chapters, bindings] = await Promise.all([
        ReadSeries(series_id),
        ListEntities(series_id),
        ListChapters(series_id),
        ListBindingsBySeries(series_id)
      ]);

      if (request_id !== request_count_ref.current) return;

      set_memory({ series: series ?? null, entities, chapters, bindings });
      set_error_message(null);
    } catch {
      if (request_id !== request_count_ref.current) return;

      console.error('[options] read-series-memory', { outcome: 'failed' });
      set_error_message(LOAD_FAILED_MESSAGE);
    } finally {
      if (request_id === request_count_ref.current) set_is_loading(false);
    }
  }, [series_id]);

  useEffect(() => {
    void Reload();
  }, [Reload]);

  return { ...memory, is_loading, error_message, Reload };
}
