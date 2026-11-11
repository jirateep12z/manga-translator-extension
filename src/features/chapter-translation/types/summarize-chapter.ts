import type { ErrorCode } from '@/types/error-code';

export type SummarizeChapterMessage = {
  action: 'summarize-chapter';
  series_id: string;
  chapter_number: string;
};

export type SummarizeChapterResponse =
  { success: true } | { success: false; error_code: ErrorCode };
