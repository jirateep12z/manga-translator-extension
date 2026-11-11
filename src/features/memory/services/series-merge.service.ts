import { OpenDatabase } from '@/services/database';
import { MergeSeriesBundles } from '../lib/merge-series-bundles';
import type { SeriesBundle, SeriesMergePreview } from '../types/memory';
import {
  AbortMemoryTransaction,
  PutSeriesBundleInTransaction,
  ReadSeriesBundleInTransaction,
  type MemoryTransaction
} from './series-bundle.service';

const SELF_MERGE_MESSAGE = 'Cannot merge a series into itself.';
const SERIES_NOT_FOUND_MESSAGE = 'Series not found.';

function AssertDifferentSeries(
  source_series_id: string,
  target_series_id: string
): void {
  if (source_series_id === target_series_id) {
    throw new Error(SELF_MERGE_MESSAGE);
  }
}

async function ReadRequiredBundle(
  transaction: MemoryTransaction,
  series_id: string
): Promise<SeriesBundle> {
  const bundle = await ReadSeriesBundleInTransaction(transaction, series_id);

  if (!bundle) throw new Error(SERIES_NOT_FOUND_MESSAGE);

  return bundle;
}

export async function PreviewSeriesMerge(
  source_series_id: string,
  target_series_id: string
): Promise<SeriesMergePreview> {
  AssertDifferentSeries(source_series_id, target_series_id);

  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['series', 'site_bindings', 'chapters', 'entities'],
    'readonly'
  ) as unknown as MemoryTransaction;
  const source = await ReadRequiredBundle(transaction, source_series_id);
  const target = await ReadRequiredBundle(transaction, target_series_id);
  const result = MergeSeriesBundles(target, source, new Date().toISOString());

  return {
    alias_count: result.added_alias_count,
    binding_count: result.moved_binding_count,
    chapter_count: source.chapters.length,
    merged_chapter_count: result.merged_chapter_count,
    entity_count: source.entities.length,
    merged_entity_count: result.merged_entity_count
  };
}

export async function MergeSeries(
  source_series_id: string,
  target_series_id: string
): Promise<void> {
  AssertDifferentSeries(source_series_id, target_series_id);

  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['series', 'site_bindings', 'chapters', 'entities', 'page_translations'],
    'readwrite'
  ) as unknown as MemoryTransaction;

  try {
    const source = await ReadRequiredBundle(transaction, source_series_id);
    const target = await ReadRequiredBundle(transaction, target_series_id);
    const { bundle } = MergeSeriesBundles(
      target,
      source,
      new Date().toISOString()
    );

    await transaction.objectStore('series').delete(source_series_id);
    for (const binding of source.site_bindings) {
      await transaction.objectStore('site_bindings').delete(binding.binding_id);
    }

    for (const chapter of source.chapters) {
      await transaction
        .objectStore('chapters')
        .delete([chapter.series_id, chapter.chapter_number]);
    }

    for (const entity of source.entities) {
      await transaction.objectStore('entities').delete(entity.entity_id);
    }

    await PutSeriesBundleInTransaction(transaction, bundle);

    let cursor = await transaction
      .objectStore('page_translations')
      .index('by_chapter')
      .openCursor(
        IDBKeyRange.bound([source_series_id], [source_series_id, []])
      );

    while (cursor) {
      await cursor.update({ ...cursor.value, series_id: target_series_id });
      cursor = await cursor.continue();
    }

    await transaction.done;
  } catch (error) {
    await AbortMemoryTransaction(transaction);

    throw error;
  }
}
