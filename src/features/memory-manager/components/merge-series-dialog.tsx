import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  MergeSeries,
  PreviewSeriesMerge,
  type SeriesMergePreview
} from '@/features/memory';
import type { SeriesRecord } from '@/services/database';
import { useRef, useState } from 'react';
import { DescribeMergePreview } from '../lib/describe-merge-preview';

const MERGE_FAILED_MESSAGE =
  "Couldn't merge these series. Nothing was changed.";

type MergeSeriesDialogProps = {
  source_series: SeriesRecord;
  series_list: SeriesRecord[];
  is_open: boolean;
  OnMerged: (target_series_id: string) => void;
  OnOpenChange: (is_open: boolean) => void;
};

function MergeSeriesForm({
  source_series,
  series_list,
  OnMerged,
  OnOpenChange
}: Omit<MergeSeriesDialogProps, 'is_open'>) {
  const [target_series_id, set_target_series_id] = useState('');
  const [preview, set_preview] = useState<SeriesMergePreview | null>(null);
  const [is_merging, set_is_merging] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const preview_request_ref = useRef(0);
  const target_options = series_list.filter(
    series => series.series_id !== source_series.series_id
  );
  const target_series = target_options.find(
    series => series.series_id === target_series_id
  );

  async function SelectTarget(next_target_id: string) {
    const request_id = ++preview_request_ref.current;

    set_target_series_id(next_target_id);
    set_preview(null);
    set_error_message(null);

    if (next_target_id === '') return;

    try {
      const next_preview = await PreviewSeriesMerge(
        source_series.series_id,
        next_target_id
      );

      if (request_id === preview_request_ref.current) set_preview(next_preview);
    } catch {
      if (request_id === preview_request_ref.current) {
        set_error_message(MERGE_FAILED_MESSAGE);
      }
    }
  }

  async function ConfirmMerge() {
    if (!preview || target_series_id === '') return;

    set_is_merging(true);

    try {
      await MergeSeries(source_series.series_id, target_series_id);
      OnOpenChange(false);
      OnMerged(target_series_id);
    } catch {
      set_error_message(MERGE_FAILED_MESSAGE);
    } finally {
      set_is_merging(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="merge-target-series">Merge into</FieldLabel>
        <Select
          value={target_series_id}
          disabled={is_merging}
          onValueChange={next_series_id => void SelectTarget(next_series_id)}
        >
          <SelectTrigger id="merge-target-series" className="w-full">
            <SelectValue placeholder="Choose a series" />
          </SelectTrigger>
          <SelectContent position="popper">
            {target_options.map(series => (
              <SelectItem key={series.series_id} value={series.series_id}>
                {series.canonical_title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {preview && target_series ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">
            {`These will move into ${target_series.canonical_title}:`}
          </p>
          <ul className="list-disc pl-5">
            {DescribeMergePreview(preview).map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {`Translations you edited or locked take priority. '${source_series.canonical_title}' will be deleted.`}
      </p>
      {error_message ? (
        <p role="alert" className="text-destructive text-sm">
          {error_message}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={() => OnOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={!preview || is_merging}
          onClick={() => void ConfirmMerge()}
        >
          {is_merging ? <Spinner aria-hidden="true" /> : null}
          Merge
        </Button>
      </DialogFooter>
    </div>
  );
}

export function MergeSeriesDialog({
  source_series,
  series_list,
  is_open,
  OnMerged,
  OnOpenChange
}: MergeSeriesDialogProps) {
  return (
    <Dialog open={is_open} onOpenChange={OnOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Merge ${source_series.canonical_title}`}</DialogTitle>
          <DialogDescription>
            Combine this series with another one that is the same work.
          </DialogDescription>
        </DialogHeader>
        {is_open ? (
          <MergeSeriesForm
            source_series={source_series}
            series_list={series_list}
            OnMerged={OnMerged}
            OnOpenChange={OnOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
