import { NormalizeText } from '@/lib/normalize-text';
import {
  OpenDatabase,
  type EntityRecord,
  type SeriesRecord,
  type SiteBindingRecord
} from '@/services/database';
import { CompareChapterNumbers } from '../lib/compare-chapter-numbers';
import { MergeSeriesBundles } from '../lib/merge-series-bundles';
import type {
  ExportedSeries,
  MemoryExportFile,
  MemoryImportPreview,
  SeriesBundle
} from '../types/memory';
import {
  AbortMemoryTransaction,
  MEMORY_STORE_NAMES,
  PutSeriesBundleInTransaction,
  ReadSeriesBundleInTransaction,
  type MemoryTransaction
} from './series-bundle.service';

function CollectNormalizedTitles(series: SeriesRecord): Set<string> {
  return new Set([
    ...series.normalized_aliases,
    NormalizeText(series.canonical_title)
  ]);
}

function ResolveImportTarget(
  existing_series: SeriesRecord[],
  imported: SeriesRecord
): SeriesRecord | undefined {
  const same_id_series = existing_series.find(
    series => series.series_id === imported.series_id
  );

  if (same_id_series) return same_id_series;

  const imported_titles = CollectNormalizedTitles(imported);

  return existing_series.find(series =>
    [...CollectNormalizedTitles(series)].some(
      title => title !== '' && imported_titles.has(title)
    )
  );
}

function ToSeriesBundle(exported: ExportedSeries): SeriesBundle {
  const { site_bindings, chapters, entities, ...series } = exported;

  return { series, site_bindings, chapters, entities };
}

function ToExportedSeries(bundle: SeriesBundle): ExportedSeries {
  return {
    ...bundle.series,
    site_bindings: [...bundle.site_bindings].sort((left, right) =>
      left.binding_id.localeCompare(right.binding_id)
    ),
    chapters: [...bundle.chapters].sort(CompareChapterNumbers),
    entities: [...bundle.entities].sort((left, right) =>
      left.normalized_source_name.localeCompare(right.normalized_source_name)
    )
  };
}

export async function ExportMemory(): Promise<MemoryExportFile> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    MEMORY_STORE_NAMES,
    'readonly'
  ) as unknown as MemoryTransaction;
  const series_list = await transaction.objectStore('series').getAll();
  const exported_series: ExportedSeries[] = [];

  for (const series of series_list) {
    const bundle = await ReadSeriesBundleInTransaction(
      transaction,
      series.series_id
    );

    if (bundle) exported_series.push(ToExportedSeries(bundle));
  }

  return {
    exported_at: new Date().toISOString(),
    series: exported_series.sort((left, right) =>
      left.canonical_title.localeCompare(right.canonical_title)
    )
  };
}

export async function PreviewMemoryImport(
  file: MemoryExportFile
): Promise<MemoryImportPreview> {
  const database = await OpenDatabase();
  const existing_series = await database.getAll('series');
  let new_series_count = 0;
  let merged_series_count = 0;

  for (const imported of file.series) {
    if (ResolveImportTarget(existing_series, imported)) {
      merged_series_count++;
    } else {
      new_series_count++;
    }
  }

  return {
    new_series_count,
    merged_series_count,
    entity_count: file.series.reduce(
      (total, series) => total + series.entities.length,
      0
    )
  };
}

async function ClaimRecordId(
  transaction: MemoryTransaction,
  store_name: 'entities' | 'site_bindings',
  record_id: string,
  claimed_ids: Set<string>
): Promise<string> {
  const is_taken =
    claimed_ids.has(record_id) ||
    (await transaction.objectStore(store_name).getKey(record_id)) !== undefined;
  const claimed_id = is_taken ? crypto.randomUUID() : record_id;

  claimed_ids.add(claimed_id);

  return claimed_id;
}

async function ReassignTakenRecordIds(
  transaction: MemoryTransaction,
  bundle: SeriesBundle,
  claimed_ids: { entities: Set<string>; site_bindings: Set<string> }
): Promise<SeriesBundle> {
  const entities: EntityRecord[] = [];
  const site_bindings: SiteBindingRecord[] = [];

  for (const entity of bundle.entities) {
    entities.push({
      ...entity,
      entity_id: await ClaimRecordId(
        transaction,
        'entities',
        entity.entity_id,
        claimed_ids.entities
      )
    });
  }

  for (const binding of bundle.site_bindings) {
    site_bindings.push({
      ...binding,
      binding_id: await ClaimRecordId(
        transaction,
        'site_bindings',
        binding.binding_id,
        claimed_ids.site_bindings
      )
    });
  }

  return { ...bundle, entities, site_bindings };
}

function CreatePatternKey(binding: SiteBindingRecord): string | null {
  return binding.series_path_pattern === null
    ? null
    : JSON.stringify([binding.hostname, binding.series_path_pattern]);
}

function CreatePatternOwners(
  bindings: SiteBindingRecord[]
): Map<string, string> {
  const pattern_owners = new Map<string, string>();

  for (const binding of bindings) {
    const pattern_key = CreatePatternKey(binding);

    if (pattern_key !== null)
      pattern_owners.set(pattern_key, binding.series_id);
  }

  return pattern_owners;
}

/** Existing pattern bindings win, as in UpsertSiteBinding; claims new ones. */
function DropConflictingPatternBindings(
  bundle: SeriesBundle,
  pattern_owners: Map<string, string>
): SeriesBundle {
  const series_id = bundle.series.series_id;
  const site_bindings = bundle.site_bindings.filter(binding => {
    const pattern_key = CreatePatternKey(binding);

    if (pattern_key === null) return true;

    const owner_series_id = pattern_owners.get(pattern_key);

    if (owner_series_id !== undefined && owner_series_id !== series_id) {
      return false;
    }

    pattern_owners.set(pattern_key, series_id);

    return true;
  });

  return { ...bundle, site_bindings };
}

export async function ImportMemory(file: MemoryExportFile): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    MEMORY_STORE_NAMES,
    'readwrite'
  ) as unknown as MemoryTransaction;
  const now_iso = new Date().toISOString();
  const claimed_ids = {
    entities: new Set<string>(),
    site_bindings: new Set<string>()
  };

  try {
    const existing_series = await transaction.objectStore('series').getAll();
    const pattern_owners = CreatePatternOwners(
      await transaction.objectStore('site_bindings').getAll()
    );

    for (const exported of file.series) {
      const imported_bundle = await ReassignTakenRecordIds(
        transaction,
        ToSeriesBundle(exported),
        claimed_ids
      );
      const target_series = ResolveImportTarget(
        existing_series,
        imported_bundle.series
      );
      const target_bundle = target_series
        ? await ReadSeriesBundleInTransaction(
            transaction,
            target_series.series_id
          )
        : undefined;
      const merged_bundle = target_bundle
        ? MergeSeriesBundles(target_bundle, imported_bundle, now_iso).bundle
        : imported_bundle;

      await PutSeriesBundleInTransaction(
        transaction,
        DropConflictingPatternBindings(merged_bundle, pattern_owners)
      );
    }

    await transaction.done;
  } catch (error) {
    await AbortMemoryTransaction(transaction);

    throw error;
  }
}
