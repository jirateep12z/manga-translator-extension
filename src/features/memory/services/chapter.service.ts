import { OpenDatabase, type ChapterRecord } from '@/services/database';
import { TEXT_LIMITS } from '../constants/memory';
import { ApplyPageNote } from '../lib/apply-page-note';
import { CompareChapterNumbers } from '../lib/compare-chapter-numbers';
import { TruncateText } from '../lib/truncate-text';
import type { PreviousChapterSummary } from '../types/memory';

const CHAPTER_NOT_FOUND_MESSAGE = 'Chapter not found.';
const SERIES_NOT_FOUND_MESSAGE = 'Series not found.';

function CreateProbeChapter(
  series_id: string,
  chapter_number: string
): ChapterRecord {
  const now_iso = new Date().toISOString();

  return {
    series_id,
    chapter_number,
    chapter_label: '',
    page_notes: [],
    notes_hostname: null,
    notes_updated_at: null,
    summary_en: '',
    summarized_at: null,
    status: 'in_progress',
    source_urls: [],
    created_at: now_iso,
    updated_at: now_iso
  };
}

export async function ReadChapter(
  series_id: string,
  chapter_number: string
): Promise<ChapterRecord | undefined> {
  const database = await OpenDatabase();

  return database.get('chapters', [series_id, chapter_number]);
}

export async function ListChapters(
  series_id: string
): Promise<ChapterRecord[]> {
  const database = await OpenDatabase();
  const chapters = await database.getAllFromIndex(
    'chapters',
    'by_series',
    series_id
  );

  return chapters.sort(CompareChapterNumbers);
}

export async function ReadPreviousChapterSummaries(
  series_id: string,
  chapter_number: string,
  limit: number
): Promise<PreviousChapterSummary[]> {
  if (limit <= 0) return [];

  const chapters = await ListChapters(series_id);
  const probe_chapter =
    chapters.find(chapter => chapter.chapter_number === chapter_number) ??
    CreateProbeChapter(series_id, chapter_number);

  return chapters
    .filter(
      chapter =>
        CompareChapterNumbers(chapter, probe_chapter) < 0 &&
        chapter.summary_en !== ''
    )
    .slice(-limit)
    .map(chapter => ({
      chapter_number: chapter.chapter_number,
      summary_en: chapter.summary_en
    }));
}

export async function SaveChapterSummary(input: {
  series_id: string;
  chapter_number: string;
  summary_en: string;
  synopsis_en: string;
}): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(['chapters', 'series'], 'readwrite');
  const chapter_store = transaction.objectStore('chapters');
  const series_store = transaction.objectStore('series');
  const chapter = await chapter_store.get([
    input.series_id,
    input.chapter_number
  ]);
  const series = await series_store.get(input.series_id);

  if (!chapter || !series) {
    transaction.abort();
    await transaction.done.catch(() => {});

    throw new Error(
      chapter ? SERIES_NOT_FOUND_MESSAGE : CHAPTER_NOT_FOUND_MESSAGE
    );
  }

  const now_iso = new Date().toISOString();

  await chapter_store.put({
    ...chapter,
    summary_en: TruncateText(input.summary_en, TEXT_LIMITS.summary),
    summarized_at: now_iso,
    status: 'summarized',
    updated_at: now_iso
  });
  await series_store.put({
    ...series,
    synopsis_en: TruncateText(input.synopsis_en, TEXT_LIMITS.summary),
    updated_at: now_iso
  });
  await transaction.done;
}

/** Matches a page by origin, path, and query; the hash never names a chapter. */
function CreateSourceUrlKey(page_url: string): string | null {
  try {
    const url = new URL(page_url);

    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Remembers the chapter the user chose for a page: the page URL moves to that
 * chapter, so a later detection on the same page finds the user's choice.
 */
export async function RecordChapterSourceUrl(input: {
  series_id: string;
  chapter_number: string;
  page_url: string;
}): Promise<void> {
  const source_url_key = CreateSourceUrlKey(input.page_url);

  if (source_url_key === null) return;

  const database = await OpenDatabase();
  const transaction = database.transaction(['chapters', 'series'], 'readwrite');
  const chapter_store = transaction.objectStore('chapters');
  const series = await transaction.objectStore('series').get(input.series_id);

  if (!series) {
    transaction.abort();
    await transaction.done.catch(() => {});

    return;
  }

  const now_iso = new Date().toISOString();
  const series_chapters = await chapter_store
    .index('by_series')
    .getAll(input.series_id);

  for (const chapter of series_chapters) {
    if (chapter.chapter_number === input.chapter_number) continue;

    const kept_source_urls = chapter.source_urls.filter(
      source_url => CreateSourceUrlKey(source_url) !== source_url_key
    );

    if (kept_source_urls.length === chapter.source_urls.length) continue;

    await chapter_store.put({
      ...chapter,
      source_urls: kept_source_urls,
      updated_at: now_iso
    });
  }

  await chapter_store.put(
    ApplyPageNote({
      chapter: series_chapters.find(
        chapter => chapter.chapter_number === input.chapter_number
      ),
      series_id: input.series_id,
      chapter_number: input.chapter_number,
      page_index: 0,
      page_hostname: '',
      page_url: input.page_url,
      note_en: '',
      now_iso
    })
  );
  await transaction.done;
}

export async function FindChapterNumberBySourceUrl(
  series_id: string,
  page_url: string
): Promise<string | null> {
  const source_url_key = CreateSourceUrlKey(page_url);

  if (source_url_key === null) return null;

  const chapters = await ListChapters(series_id);
  const matching_chapters = chapters
    .filter(chapter =>
      chapter.source_urls.some(
        source_url => CreateSourceUrlKey(source_url) === source_url_key
      )
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  return matching_chapters[0]?.chapter_number ?? null;
}

export async function UpdateChapterSummaryText(
  series_id: string,
  chapter_number: string,
  summary_en: string
): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction('chapters', 'readwrite');
  const chapter = await transaction.store.get([series_id, chapter_number]);

  if (!chapter) {
    transaction.abort();
    await transaction.done.catch(() => {});

    throw new Error(CHAPTER_NOT_FOUND_MESSAGE);
  }

  await transaction.store.put({
    ...chapter,
    summary_en: TruncateText(summary_en, TEXT_LIMITS.summary),
    updated_at: new Date().toISOString()
  });
  await transaction.done;
}
