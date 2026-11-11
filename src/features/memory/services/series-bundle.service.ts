import type { MangaTranslatorSchema } from '@/services/database';
import type { IDBPTransaction, StoreNames } from 'idb';
import { NormalizeEntityRecord } from '../lib/normalize-entity-record';
import type { SeriesBundle } from '../types/memory';

type MemoryStoreName = 'series' | 'site_bindings' | 'chapters' | 'entities';

export type MemoryTransaction = IDBPTransaction<
  MangaTranslatorSchema,
  StoreNames<MangaTranslatorSchema>[],
  'readwrite'
>;

export const MEMORY_STORE_NAMES: MemoryStoreName[] = [
  'series',
  'site_bindings',
  'chapters',
  'entities'
];

export async function AbortMemoryTransaction(
  transaction: MemoryTransaction
): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // The transaction already finished, so there is nothing left to abort.
  }

  await transaction.done.catch(() => {});
}

export async function ReadSeriesBundleInTransaction(
  transaction: MemoryTransaction,
  series_id: string
): Promise<SeriesBundle | undefined> {
  const series = await transaction.objectStore('series').get(series_id);

  if (!series) return undefined;

  const site_bindings = await transaction
    .objectStore('site_bindings')
    .index('by_series')
    .getAll(series_id);
  const chapters = await transaction
    .objectStore('chapters')
    .index('by_series')
    .getAll(series_id);
  const entities = await transaction
    .objectStore('entities')
    .index('by_series')
    .getAll(series_id);

  return {
    series,
    site_bindings,
    chapters,
    entities: entities.map(NormalizeEntityRecord)
  };
}

export async function PutSeriesBundleInTransaction(
  transaction: MemoryTransaction,
  bundle: SeriesBundle
): Promise<void> {
  await transaction.objectStore('series').put(bundle.series);
  for (const binding of bundle.site_bindings) {
    await transaction.objectStore('site_bindings').put(binding);
  }

  for (const chapter of bundle.chapters) {
    await transaction.objectStore('chapters').put(chapter);
  }

  for (const entity of bundle.entities) {
    await transaction.objectStore('entities').put(entity);
  }
}
