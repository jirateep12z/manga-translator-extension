import { NormalizeText } from '@/lib/normalize-text';
import { OpenDatabase, type SeriesRecord } from '@/services/database';
import { IMPORT_TEXT_LIMITS, TEXT_LIMITS } from '../constants/memory';
import { TruncateText } from '../lib/truncate-text';

const SERIES_NOT_FOUND_MESSAGE = 'Series not found.';

function CleanTitle(title: string): string {
  return TruncateText(title, IMPORT_TEXT_LIMITS.title);
}

function DeduplicateAliases(aliases: string[]): string[] {
  const seen_aliases = new Set<string>();

  return aliases.filter(alias => {
    const normalized_alias = NormalizeText(alias);

    if (alias === '' || seen_aliases.has(normalized_alias)) return false;
    seen_aliases.add(normalized_alias);

    return true;
  });
}

function WithAliases(series: SeriesRecord, aliases: string[]): SeriesRecord {
  const unique_aliases = DeduplicateAliases(aliases);

  return {
    ...series,
    aliases: unique_aliases,
    normalized_aliases: unique_aliases.map(NormalizeText),
    updated_at: new Date().toISOString()
  };
}

async function UpdateSeries(
  series_id: string,
  Update: (series: SeriesRecord) => SeriesRecord
): Promise<SeriesRecord> {
  const database = await OpenDatabase();
  const transaction = database.transaction('series', 'readwrite');
  const series = await transaction.store.get(series_id);

  if (!series) {
    transaction.abort();
    await transaction.done.catch(() => {});

    throw new Error(SERIES_NOT_FOUND_MESSAGE);
  }

  const updated_series = Update(series);

  await transaction.store.put(updated_series);
  await transaction.done;

  return updated_series;
}

export async function CreateSeries(input: {
  canonical_title: string;
  detected_title: string;
}): Promise<SeriesRecord> {
  const canonical_title = CleanTitle(input.canonical_title);

  if (canonical_title === '') {
    throw new Error('canonical_title is required.');
  }

  const now_iso = new Date().toISOString();
  const aliases = DeduplicateAliases([
    canonical_title,
    CleanTitle(input.detected_title)
  ]);
  const series: SeriesRecord = {
    series_id: crypto.randomUUID(),
    canonical_title,
    aliases,
    normalized_aliases: aliases.map(NormalizeText),
    synopsis_en: '',
    created_at: now_iso,
    updated_at: now_iso
  };
  const database = await OpenDatabase();

  await database.put('series', series);

  return series;
}

export async function ReadSeries(
  series_id: string
): Promise<SeriesRecord | undefined> {
  const database = await OpenDatabase();

  return database.get('series', series_id);
}

export async function ListSeries(): Promise<SeriesRecord[]> {
  const database = await OpenDatabase();
  const series_list = await database.getAll('series');

  return series_list.sort((left, right) =>
    left.canonical_title.localeCompare(right.canonical_title)
  );
}

export async function RenameSeries(
  series_id: string,
  canonical_title: string
): Promise<SeriesRecord> {
  const cleaned_title = CleanTitle(canonical_title);

  if (cleaned_title === '') {
    throw new Error('canonical_title is required.');
  }

  return UpdateSeries(series_id, series => ({
    ...WithAliases(series, [...series.aliases, cleaned_title]),
    canonical_title: cleaned_title
  }));
}

export async function AddSeriesAlias(
  series_id: string,
  alias: string
): Promise<SeriesRecord> {
  const cleaned_alias = CleanTitle(alias);

  return UpdateSeries(series_id, series =>
    WithAliases(series, [...series.aliases, cleaned_alias])
  );
}

export async function RemoveSeriesAlias(
  series_id: string,
  alias: string
): Promise<SeriesRecord> {
  const normalized_alias = NormalizeText(alias);

  return UpdateSeries(series_id, series =>
    WithAliases(
      series,
      series.aliases.filter(
        existing_alias => NormalizeText(existing_alias) !== normalized_alias
      )
    )
  );
}

export async function DeleteSeries(series_id: string): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['series', 'site_bindings', 'chapters', 'entities', 'page_translations'],
    'readwrite'
  );

  await transaction.objectStore('series').delete(series_id);
  for (const store_name of ['site_bindings', 'chapters', 'entities'] as const) {
    let cursor = await transaction
      .objectStore(store_name)
      .index('by_series')
      .openCursor(series_id);

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }

  let translation_cursor = await transaction
    .objectStore('page_translations')
    .index('by_chapter')
    .openCursor(IDBKeyRange.bound([series_id], [series_id, []]));

  while (translation_cursor) {
    await translation_cursor.delete();
    translation_cursor = await translation_cursor.continue();
  }

  await transaction.done;
}

export async function UpdateSeriesSynopsis(
  series_id: string,
  synopsis_en: string
): Promise<SeriesRecord> {
  return UpdateSeries(series_id, series => ({
    ...series,
    synopsis_en: TruncateText(synopsis_en, TEXT_LIMITS.summary),
    updated_at: new Date().toISOString()
  }));
}

export async function SetSeriesAutoTranslate(
  series_id: string,
  is_auto_translate_enabled: boolean
): Promise<SeriesRecord> {
  return UpdateSeries(series_id, series => ({
    ...series,
    is_auto_translate_enabled,
    updated_at: new Date().toISOString()
  }));
}
