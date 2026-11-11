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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  ExportMemory,
  ImportMemory,
  PreviewMemoryImport,
  type MemoryExportFile,
  type MemoryImportPreview
} from '@/features/memory';
import { ClearCache, ReadCacheStats } from '@/features/translation-cache';
import { Download, Trash, Upload } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { BuildExportFileName } from '../lib/build-export-file-name';
import { DownloadJsonFile } from '../lib/download-json-file';
import { FormatByteSize } from '../lib/format-byte-size';
import { ReadImportFile } from '../lib/read-import-file';

type CacheStats = { page_count: number; estimated_bytes: number };

type PendingImport = { file: MemoryExportFile; preview: MemoryImportPreview };

function ExportCard() {
  const [is_exporting, set_is_exporting] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);

  async function HandleExport() {
    set_is_exporting(true);
    set_error_message(null);

    try {
      DownloadJsonFile(BuildExportFileName(new Date()), await ExportMemory());
    } catch {
      set_error_message("Couldn't export your memory. Try again.");
    } finally {
      set_is_exporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export memory</CardTitle>
        <CardDescription>
          Saves series, characters, terms, chapter summaries, and site links.
          Cached translations and settings, including your API key, are not
          included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          className="self-start"
          disabled={is_exporting}
          onClick={() => void HandleExport()}
        >
          {is_exporting ? (
            <Spinner aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Export
        </Button>
        {error_message ? (
          <p role="alert" className="text-destructive text-sm">
            {error_message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ImportCard() {
  const [file_error, set_file_error] = useState<string | null>(null);
  const [pending_import, set_pending_import] = useState<PendingImport | null>(
    null
  );
  const [status_message, set_status_message] = useState<string | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_reading, set_is_reading] = useState(false);

  async function HandleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input_element = event.currentTarget;
    const selected_file = input_element.files?.[0];

    set_file_error(null);
    set_status_message(null);
    set_error_message(null);

    if (!selected_file) return;

    set_is_reading(true);

    try {
      const validation = await ReadImportFile(selected_file);

      if (!validation.is_valid) {
        set_file_error(validation.error);

        return;
      }

      set_pending_import({
        file: validation.file,
        preview: await PreviewMemoryImport(validation.file)
      });
    } catch {
      set_error_message("Couldn't import this file. Nothing was changed.");
    } finally {
      set_is_reading(false);
      // Clearing the input lets the same file be chosen again.
      input_element.value = '';
    }
  }

  async function ConfirmImport(file: MemoryExportFile) {
    try {
      await ImportMemory(file);
      set_status_message('Import complete.');
    } catch {
      set_error_message("Couldn't import this file. Nothing was changed.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import memory</CardTitle>
        <CardDescription>
          Adds series from an export file. Existing data is never deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Field data-invalid={file_error ? true : undefined}>
          <FieldLabel htmlFor="memory-import-file">
            <Upload aria-hidden="true" className="size-4" />
            Choose an export file
          </FieldLabel>
          <Input
            id="memory-import-file"
            type="file"
            accept="application/json,.json"
            disabled={is_reading}
            aria-invalid={file_error ? true : undefined}
            onChange={event => void HandleFileChange(event)}
          />
          {file_error ? <FieldError>{file_error}</FieldError> : null}
        </Field>
        {status_message ? (
          <p role="status" className="text-sm">
            {status_message}
          </p>
        ) : null}
        {error_message ? (
          <p role="alert" className="text-destructive text-sm">
            {error_message}
          </p>
        ) : null}
      </CardContent>
      <AlertDialog
        open={pending_import !== null}
        onOpenChange={is_open => {
          if (!is_open) set_pending_import(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import this file?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc pl-5 text-left">
                <li>{`${pending_import?.preview.new_series_count ?? 0} new series`}</li>
                <li>
                  {`${pending_import?.preview.merged_series_count ?? 0} series merged with existing ones`}
                </li>
                <li>
                  {`${pending_import?.preview.entity_count ?? 0} characters and terms`}
                </li>
                <li>Existing data is never deleted.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending_import) void ConfirmImport(pending_import.file);
              }}
            >
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CacheCard() {
  const [cache_stats, set_cache_stats] = useState<CacheStats | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_confirming, set_is_confirming] = useState(false);
  const [stats_refresh_count, set_stats_refresh_count] = useState(0);

  useEffect(() => {
    let is_active = true;

    ReadCacheStats()
      .then(next_stats => {
        if (!is_active) return;

        set_cache_stats(next_stats);
      })
      .catch(() => {
        if (is_active) {
          set_error_message("Couldn't read the cache. Reload the page.");
        }
      });

    return () => {
      is_active = false;
    };
  }, [stats_refresh_count]);

  async function HandleClear() {
    try {
      await ClearCache();
      set_error_message(null);
    } catch {
      set_error_message("Couldn't clear the cache. Try again.");
    } finally {
      set_stats_refresh_count(count => count + 1);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache</CardTitle>
        <CardDescription role="status">
          {cache_stats
            ? `${cache_stats.page_count} cached pages · ${FormatByteSize(cache_stats.estimated_bytes)}`
            : 'Reading cache size…'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => set_is_confirming(true)}
        >
          <Trash aria-hidden="true" />
          Clear cache
        </Button>
        {error_message ? (
          <p role="alert" className="text-destructive text-sm">
            {error_message}
          </p>
        ) : null}
      </CardContent>
      <AlertDialog open={is_confirming} onOpenChange={set_is_confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear cached translations?</AlertDialogTitle>
            <AlertDialogDescription>
              Translated pages will need AI calls again. Your memory is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void HandleClear()}
            >
              Clear cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function DataSection() {
  return (
    <div className="flex flex-col gap-6">
      <ExportCard />
      <ImportCard />
      <CacheCard />
    </div>
  );
}
