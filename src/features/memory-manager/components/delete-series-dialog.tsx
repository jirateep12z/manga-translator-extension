import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { DeleteSeries } from '@/features/memory';
import type { SeriesRecord } from '@/services/database';

type DeleteSeriesDialogProps = {
  series: SeriesRecord;
  is_open: boolean;
  OnDeleted: () => void;
  OnFailed: (message: string) => void;
  OnOpenChange: (is_open: boolean) => void;
};

const DELETE_FAILED_MESSAGE = "Couldn't delete the series. Try again.";

export function DeleteSeriesDialog({
  series,
  is_open,
  OnDeleted,
  OnFailed,
  OnOpenChange
}: DeleteSeriesDialogProps) {
  async function HandleDelete() {
    try {
      await DeleteSeries(series.series_id);
      OnDeleted();
    } catch {
      OnFailed(DELETE_FAILED_MESSAGE);
    }
  }

  return (
    <AlertDialog open={is_open} onOpenChange={OnOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${series.canonical_title}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes its characters, terms, chapter summaries,
            and site links. Cached translations for it are also removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void HandleDelete()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
