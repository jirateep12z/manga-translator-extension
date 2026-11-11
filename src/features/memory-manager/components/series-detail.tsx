import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TargetLanguage } from '@/features/settings';
import type { SeriesRecord } from '@/services/database';
import { Merge, Pencil, Trash } from 'lucide-react';
import { useState } from 'react';
import { UseSeriesMemory } from '../hooks/use-series-memory';
import { ChapterList } from './chapter-list';
import { DeleteSeriesDialog } from './delete-series-dialog';
import { EntityTable } from './entity-table';
import { MergeSeriesDialog } from './merge-series-dialog';
import { RenameSeriesDialog } from './rename-series-dialog';
import { SitesAndAliases } from './sites-and-aliases';

type OpenDialog = 'rename' | 'delete' | 'merge' | null;

type SeriesDetailProps = {
  series_id: string;
  series_list: SeriesRecord[];
  default_target_language: TargetLanguage;
  OnDeleted: () => void;
  OnMerged: (target_series_id: string) => void;
  OnRenamed: () => void;
};

export function SeriesDetail({
  series_id,
  series_list,
  default_target_language,
  OnDeleted,
  OnMerged,
  OnRenamed
}: SeriesDetailProps) {
  const {
    series,
    entities,
    chapters,
    bindings,
    is_loading,
    error_message,
    Reload
  } = UseSeriesMemory(series_id);
  const [open_dialog, set_open_dialog] = useState<OpenDialog>(null);
  const [action_error_message, set_action_error_message] = useState<
    string | null
  >(null);

  if (error_message) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {error_message}
      </p>
    );
  }

  if (!series) {
    return is_loading ? (
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner aria-hidden="true" />
        Loading…
      </p>
    ) : null;
  }

  const SetDialogOpen =
    (dialog: Exclude<OpenDialog, null>) => (is_open: boolean) =>
      set_open_dialog(is_open ? dialog : null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold">
          {series.canonical_title}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => set_open_dialog('rename')}
          >
            <Pencil aria-hidden="true" />
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set_open_dialog('merge')}
          >
            <Merge aria-hidden="true" />
            Merge into…
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => set_open_dialog('delete')}
          >
            <Trash aria-hidden="true" />
            Delete
          </Button>
        </div>
      </header>
      {action_error_message ? (
        <p role="alert" className="text-destructive text-sm">
          {action_error_message}
        </p>
      ) : null}
      <Tabs defaultValue="entities">
        <TabsList>
          <TabsTrigger value="entities">Characters &amp; Terms</TabsTrigger>
          <TabsTrigger value="chapters">Chapters</TabsTrigger>
          <TabsTrigger value="sites">Sites &amp; Aliases</TabsTrigger>
        </TabsList>
        <TabsContent value="entities" className="mt-4">
          <EntityTable
            series_id={series.series_id}
            entities={entities}
            default_target_language={default_target_language}
            OnChanged={() => void Reload()}
          />
        </TabsContent>
        <TabsContent value="chapters" className="mt-4">
          <ChapterList
            series={series}
            chapters={chapters}
            OnChanged={() => void Reload()}
          />
        </TabsContent>
        <TabsContent value="sites" className="mt-4">
          <SitesAndAliases
            series={series}
            bindings={bindings}
            OnChanged={() => void Reload()}
          />
        </TabsContent>
      </Tabs>
      <RenameSeriesDialog
        series={series}
        is_open={open_dialog === 'rename'}
        OnOpenChange={SetDialogOpen('rename')}
        OnRenamed={() => {
          void Reload();
          OnRenamed();
        }}
      />
      <DeleteSeriesDialog
        series={series}
        is_open={open_dialog === 'delete'}
        OnDeleted={OnDeleted}
        OnFailed={set_action_error_message}
        OnOpenChange={SetDialogOpen('delete')}
      />
      <MergeSeriesDialog
        source_series={series}
        series_list={series_list}
        is_open={open_dialog === 'merge'}
        OnMerged={OnMerged}
        OnOpenChange={SetDialogOpen('merge')}
      />
    </div>
  );
}
