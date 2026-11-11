import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import type { SeriesRecord } from '@/services/database';
import { Search } from 'lucide-react';
import { FilterSeries } from '../lib/filter-series';

type SeriesListProps = {
  series_list: SeriesRecord[];
  selected_series_id: string | null;
  query: string;
  OnQueryChange: (query: string) => void;
  OnSelect: (series_id: string) => void;
};

export function SeriesList({
  series_list,
  selected_series_id,
  query,
  OnQueryChange,
  OnSelect
}: SeriesListProps) {
  const filtered_series = FilterSeries(series_list, query);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          aria-label="Search series"
          className="pl-8"
          value={query}
          onChange={event => OnQueryChange(event.target.value)}
        />
      </div>
      {filtered_series.length === 0 ? (
        <Empty>
          <EmptyDescription>
            {series_list.length === 0
              ? 'No series yet. Translate a chapter to create one.'
              : 'No series match your search.'}
          </EmptyDescription>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered_series.map(series => {
            const is_selected = series.series_id === selected_series_id;

            return (
              <li key={series.series_id}>
                <Button
                  variant="ghost"
                  className={
                    is_selected
                      ? 'bg-muted w-full justify-start'
                      : 'w-full justify-start'
                  }
                  aria-current={is_selected ? 'true' : undefined}
                  onClick={() => OnSelect(series.series_id)}
                >
                  <span className="truncate">{series.canonical_title}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
