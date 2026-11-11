import type { ChapterRecord } from '@/services/database';
import {
  IMPORT_TEXT_LIMITS,
  MAX_SOURCE_URLS_PER_CHAPTER,
  TEXT_LIMITS
} from '../constants/memory';
import { TruncateText } from './truncate-text';

const URL_CHAPTER_PREFIX = 'url:';

type ApplyPageNoteInput = {
  chapter: ChapterRecord | undefined;
  series_id: string;
  chapter_number: string;
  page_index: number;
  page_hostname: string;
  page_url: string;
  note_en: string;
  now_iso: string;
};

function CreateChapterLabel(chapter_number: string): string {
  return chapter_number.startsWith(URL_CHAPTER_PREFIX)
    ? chapter_number.slice(URL_CHAPTER_PREFIX.length)
    : `Chapter ${chapter_number}`;
}

function CreateChapter(input: ApplyPageNoteInput): ChapterRecord {
  return {
    series_id: input.series_id,
    chapter_number: input.chapter_number,
    chapter_label: CreateChapterLabel(input.chapter_number),
    page_notes: [],
    notes_hostname: null,
    notes_updated_at: null,
    summary_en: '',
    summarized_at: null,
    status: 'in_progress',
    source_urls: [],
    created_at: input.now_iso,
    updated_at: input.now_iso
  };
}

export function ApplyPageNote(input: ApplyPageNoteInput): ChapterRecord {
  const base_chapter = input.chapter ?? CreateChapter(input);
  const is_page_url_storable =
    Array.from(input.page_url).length <= IMPORT_TEXT_LIMITS.url;
  const source_urls = (
    !is_page_url_storable || base_chapter.source_urls.includes(input.page_url)
      ? base_chapter.source_urls
      : [...base_chapter.source_urls, input.page_url]
  ).slice(-MAX_SOURCE_URLS_PER_CHAPTER);
  const note_en = TruncateText(input.note_en, TEXT_LIMITS.page_note);

  if (note_en === '') {
    return { ...base_chapter, source_urls, updated_at: input.now_iso };
  }

  const is_other_hostname =
    base_chapter.notes_hostname !== null &&
    base_chapter.notes_hostname !== input.page_hostname;
  const kept_notes = is_other_hostname
    ? []
    : base_chapter.page_notes.filter(
        page_note => page_note.page_index !== input.page_index
      );

  return {
    ...base_chapter,
    page_notes: [...kept_notes, { page_index: input.page_index, note_en }].sort(
      (left, right) => left.page_index - right.page_index
    ),
    notes_hostname: input.page_hostname,
    notes_updated_at: input.now_iso,
    status: 'in_progress',
    source_urls,
    updated_at: input.now_iso
  };
}
