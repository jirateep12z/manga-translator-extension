import { openDB, type IDBPDatabase } from 'idb';
import { DATABASE_NAME, DATABASE_VERSION } from '../constants/database';
import type { MangaTranslatorSchema } from '../types/records';

export type MangaTranslatorDatabase = IDBPDatabase<MangaTranslatorSchema>;

let database_promise: Promise<MangaTranslatorDatabase> | null = null;

function UpgradeDatabase(database: MangaTranslatorDatabase): void {
  database.createObjectStore('series', { keyPath: 'series_id' });

  const site_bindings = database.createObjectStore('site_bindings', {
    keyPath: 'binding_id'
  });

  site_bindings.createIndex('by_hostname', 'hostname');
  site_bindings.createIndex('by_series', 'series_id');

  const chapters = database.createObjectStore('chapters', {
    keyPath: ['series_id', 'chapter_number']
  });

  chapters.createIndex('by_series', 'series_id');

  const entities = database.createObjectStore('entities', {
    keyPath: 'entity_id'
  });

  entities.createIndex('by_series', 'series_id');
  entities.createIndex('by_series_name', [
    'series_id',
    'normalized_source_name'
  ]);

  const page_readings = database.createObjectStore('page_readings', {
    keyPath: 'reading_key'
  });

  page_readings.createIndex('by_image_url', 'image_url');
  page_readings.createIndex('by_last_used', 'last_used_at');

  const page_translations = database.createObjectStore('page_translations', {
    keyPath: ['reading_key', 'target_language']
  });

  page_translations.createIndex('by_chapter', ['series_id', 'chapter_number']);
  page_translations.createIndex('by_chapter_page', [
    'series_id',
    'chapter_number',
    'target_language',
    'page_index'
  ]);
  page_translations.createIndex('by_reading', 'reading_key');
}

export function OpenDatabase(): Promise<MangaTranslatorDatabase> {
  if (database_promise) return database_promise;

  const opening_promise = openDB<MangaTranslatorSchema>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade: database => UpgradeDatabase(database),
      blocking: () => {
        ResetDatabaseConnection();
      },
      terminated: () => {
        if (database_promise === opening_promise) {
          database_promise = null;
        }
      }
    }
  );

  database_promise = opening_promise;
  opening_promise.catch(() => {
    if (database_promise === opening_promise) {
      database_promise = null;
    }
  });

  return opening_promise;
}

export function ResetDatabaseConnection(): void {
  const previous_promise = database_promise;

  database_promise = null;
  previous_promise
    ?.then(database => {
      database.close();
    })
    .catch(() => {});
}
