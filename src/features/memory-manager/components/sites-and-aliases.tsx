import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { DeleteSiteBinding, RemoveSeriesAlias } from '@/features/memory';
import type { SeriesRecord, SiteBindingRecord } from '@/services/database';
import { useState } from 'react';

const REMOVE_FAILED_MESSAGE = "Couldn't remove it. Try again.";

type SitesAndAliasesProps = {
  series: SeriesRecord;
  bindings: SiteBindingRecord[];
  OnChanged: () => void;
};

export function SitesAndAliases({
  series,
  bindings,
  OnChanged
}: SitesAndAliasesProps) {
  const [error_message, set_error_message] = useState<string | null>(null);

  async function RunRemoval(Remove: () => Promise<unknown>) {
    try {
      await Remove();
      set_error_message(null);
    } catch {
      set_error_message(REMOVE_FAILED_MESSAGE);
    } finally {
      OnChanged();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error_message ? (
        <p role="alert" className="text-destructive text-sm">
          {error_message}
        </p>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Linked sites</h3>
        {bindings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No linked sites.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map(binding => (
                <TableRow key={binding.binding_id}>
                  <TableCell>{binding.hostname}</TableCell>
                  <TableCell>
                    {binding.series_path_pattern ??
                      'Whole site (title match only)'}
                  </TableCell>
                  <TableCell>
                    {new Date(binding.confirmed_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Remove link to ${binding.hostname}`}
                      onClick={() =>
                        void RunRemoval(() =>
                          DeleteSiteBinding(binding.binding_id)
                        )
                      }
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Aliases</h3>
        {series.aliases.length === 0 ? (
          <p className="text-muted-foreground text-sm">No aliases.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {series.aliases.map(alias => (
              <li
                key={alias}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">{alias}</span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Remove alias ${alias}`}
                  onClick={() =>
                    void RunRemoval(() =>
                      RemoveSeriesAlias(series.series_id, alias)
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
