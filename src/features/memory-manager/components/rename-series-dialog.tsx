import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RenameSeries } from '@/features/memory';
import type { SeriesRecord } from '@/services/database';
import { useState, type FormEvent } from 'react';
import { MAX_SERIES_TITLE_LENGTH } from '../constants/memory-manager';
import { ValidateSeriesTitle } from '../lib/validate-series-title';

type RenameSeriesDialogProps = {
  series: SeriesRecord;
  is_open: boolean;
  OnOpenChange: (is_open: boolean) => void;
  OnRenamed: () => void;
};

const RENAME_FAILED_MESSAGE = "Couldn't rename the series. Try again.";

function RenameSeriesForm({
  series,
  OnOpenChange,
  OnRenamed
}: Omit<RenameSeriesDialogProps, 'is_open'>) {
  const [title_draft, set_title_draft] = useState(series.canonical_title);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_saving, set_is_saving] = useState(false);

  async function HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = ValidateSeriesTitle(title_draft);

    if (!validation.is_valid) {
      set_error_message(validation.error);

      return;
    }

    set_is_saving(true);

    try {
      await RenameSeries(series.series_id, validation.title);
      OnOpenChange(false);
      OnRenamed();
    } catch {
      set_error_message(RENAME_FAILED_MESSAGE);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={HandleSubmit}>
      <Field data-invalid={error_message ? true : undefined}>
        <FieldLabel htmlFor="rename-series-title">Title</FieldLabel>
        <Input
          id="rename-series-title"
          value={title_draft}
          maxLength={MAX_SERIES_TITLE_LENGTH + 1}
          aria-invalid={error_message ? true : undefined}
          onChange={event => set_title_draft(event.target.value)}
        />
        {error_message ? <FieldError>{error_message}</FieldError> : null}
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => OnOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={is_saving}>
          Rename
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameSeriesDialog({
  series,
  is_open,
  OnOpenChange,
  OnRenamed
}: RenameSeriesDialogProps) {
  return (
    <Dialog open={is_open} onOpenChange={OnOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename series</DialogTitle>
        </DialogHeader>
        {/* Mounting the form per opening resets the draft to the saved title. */}
        {is_open ? (
          <RenameSeriesForm
            series={series}
            OnOpenChange={OnOpenChange}
            OnRenamed={OnRenamed}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
