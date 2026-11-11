import { Spinner } from '@/components/ui/spinner';
import type { TargetLanguage } from '@/features/settings';
import { useState } from 'react';
import { UseSeriesList } from '../hooks/use-series-list';
import { SeriesDetail } from './series-detail';
import { SeriesList } from './series-list';

export function SeriesSection({
  default_target_language
}: {
  default_target_language: TargetLanguage;
}) {
  const { series_list, is_loading, error_message, Reload } = UseSeriesList();
  const [chosen_series_id, set_chosen_series_id] = useState<string | null>(
    null
  );
  const [query, set_query] = useState('');
  // The first series is shown until the user picks one, and a deleted or
  // merged selection falls back the same way.
  const selected_series_id =
    series_list.find(series => series.series_id === chosen_series_id)
      ?.series_id ??
    series_list[0]?.series_id ??
    null;

  if (is_loading) {
    return (
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner aria-hidden="true" />
        Loading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="md:w-64 md:shrink-0">
        {error_message ? (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {error_message}
          </p>
        ) : null}
        <SeriesList
          series_list={series_list}
          selected_series_id={selected_series_id}
          query={query}
          OnQueryChange={set_query}
          OnSelect={set_chosen_series_id}
        />
      </aside>
      <section className="min-w-0 flex-1" aria-label="Series details">
        {selected_series_id ? (
          <SeriesDetail
            key={selected_series_id}
            series_id={selected_series_id}
            series_list={series_list}
            default_target_language={default_target_language}
            OnDeleted={() => {
              set_chosen_series_id(null);
              void Reload();
            }}
            OnMerged={target_series_id => {
              set_chosen_series_id(target_series_id);
              void Reload();
            }}
            OnRenamed={() => void Reload()}
          />
        ) : null}
      </section>
    </div>
  );
}
