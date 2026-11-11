import {
  ApplyPageNote,
  MergeReportedEntities,
  NormalizeEntityRecord,
  type AliasCandidate,
  type LearnedNameVariant,
  type ReportedEntity,
  type SpeechObservation
} from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import {
  EvictLeastRecentlyUsed,
  QUOTA_RECOVERY_KEEP_RATIO,
  ReadCacheStats,
  WithQuotaRecovery
} from '@/features/translation-cache';
import { AppError } from '@/lib/app-error';
import {
  OpenDatabase,
  type MangaTranslatorSchema,
  type RegionTranslation
} from '@/services/database';
import type { IDBPTransaction } from 'idb';

export type PageCommit = {
  series_id: string;
  chapter_number: string;
  page_index: number;
  page_url: string;
  page_hostname: string;
  target_language: TargetLanguage;
  reading_key: string;
  translations: RegionTranslation[];
  model: string;
  reported_entities: ReportedEntity[];
  page_note_en: string | null;
  page_source_text: string;
  now_iso: string;
  alias_candidates: AliasCandidate[];
  speech_observations: SpeechObservation[];
  learned_name_variants: LearnedNameVariant[];
};

async function RecoverCacheQuota(): Promise<void> {
  const { page_count } = await ReadCacheStats();

  await EvictLeastRecentlyUsed(
    Math.floor(page_count * QUOTA_RECOVERY_KEEP_RATIO)
  );
}

type CommitTransaction = IDBPTransaction<
  MangaTranslatorSchema,
  (
    'series' | 'entities' | 'chapters' | 'page_translations' | 'page_readings'
  )[],
  'readwrite'
>;

async function AbortCommitTransaction(
  transaction: CommitTransaction
): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // The transaction already finished, so there is nothing left to abort.
  }

  await transaction.done.catch(() => {});
}

async function WritePageCommit(commit: PageCommit): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['series', 'entities', 'chapters', 'page_translations', 'page_readings'],
    'readwrite'
  );

  try {
    await WritePageCommitInTransaction(transaction, commit);
  } catch (error) {
    await AbortCommitTransaction(transaction);

    throw error;
  }
}

async function WritePageCommitInTransaction(
  transaction: CommitTransaction,
  commit: PageCommit
): Promise<void> {
  // The series may have been deleted while the page job ran; its cascade has
  // already committed, so writing now would leave orphaned rows.
  const series = await transaction.objectStore('series').get(commit.series_id);

  if (!series) throw new AppError('CANCELED', 'The series no longer exists.');

  const entity_store = transaction.objectStore('entities');
  const existing_entities = (
    await entity_store.index('by_series').getAll(commit.series_id)
  ).map(NormalizeEntityRecord);
  const merged_entities = MergeReportedEntities({
    series_id: commit.series_id,
    chapter_number: commit.chapter_number,
    target_language: commit.target_language,
    existing_entities,
    reported_entities: commit.reported_entities,
    page_source_text: commit.page_source_text,
    now_iso: commit.now_iso,
    alias_candidates: commit.alias_candidates,
    speech_observations: commit.speech_observations,
    learned_name_variants: commit.learned_name_variants
  });

  for (const entity of merged_entities) {
    await entity_store.put(entity);
  }

  if (commit.page_note_en) {
    const chapter_store = transaction.objectStore('chapters');
    const chapter = await chapter_store.get([
      commit.series_id,
      commit.chapter_number
    ]);

    await chapter_store.put(
      ApplyPageNote({
        chapter,
        series_id: commit.series_id,
        chapter_number: commit.chapter_number,
        page_index: commit.page_index,
        page_hostname: commit.page_hostname,
        page_url: commit.page_url,
        note_en: commit.page_note_en,
        now_iso: commit.now_iso
      })
    );
  }

  await transaction.objectStore('page_translations').put({
    reading_key: commit.reading_key,
    target_language: commit.target_language,
    series_id: commit.series_id,
    chapter_number: commit.chapter_number,
    page_index: commit.page_index,
    page_hostname: commit.page_hostname,
    translations: commit.translations,
    model: commit.model,
    created_at: commit.now_iso
  });

  const reading_store = transaction.objectStore('page_readings');
  const reading = await reading_store.get(commit.reading_key);

  if (reading) {
    await reading_store.put({ ...reading, last_used_at: commit.now_iso });
  }

  await transaction.done;
}

export function CommitPageResult(commit: PageCommit): Promise<void> {
  return WithQuotaRecovery(() => WritePageCommit(commit), RecoverCacheQuota);
}
