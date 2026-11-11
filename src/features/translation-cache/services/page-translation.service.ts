import { OpenDatabase, type PageTranslationRecord } from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';

export async function ReadPageTranslation(
  reading_key: string,
  target_language: TargetLanguage
): Promise<PageTranslationRecord | undefined> {
  const database = await OpenDatabase();

  return database.get('page_translations', [reading_key, target_language]);
}

export async function ListChapterPageTranslations(input: {
  series_id: string;
  chapter_number: string;
  target_language: TargetLanguage;
  page_hostname: string;
}): Promise<PageTranslationRecord[]> {
  const database = await OpenDatabase();
  const records = await database.getAllFromIndex(
    'page_translations',
    'by_chapter_page',
    IDBKeyRange.bound(
      [input.series_id, input.chapter_number, input.target_language, -Infinity],
      [input.series_id, input.chapter_number, input.target_language, Infinity]
    )
  );

  return records.filter(record => record.page_hostname === input.page_hostname);
}
