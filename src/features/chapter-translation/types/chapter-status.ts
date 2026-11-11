import type { TargetLanguage } from '@/features/settings';
import type { ChapterStatus } from '@/services/database';

export type GetChapterStatusMessage = {
  action: 'get-chapter-status';
  series_id: string;
  chapter_number: string;
  target_language: TargetLanguage;
  page_hostname: string;
};

export type GetChapterStatusResponse = {
  cached_page_count: number;
  chapter_status: ChapterStatus | null;
};
