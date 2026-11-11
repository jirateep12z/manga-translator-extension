import { TARGET_LANGUAGE_LABELS } from '@/constants/language-labels';
import type {
  PageJobStatus,
  PageOutcome
} from '@/features/chapter-translation';
import type { TargetLanguage } from '@/types/target-language';
import type { PageBadge } from '../types/overlay';

export function ResolvePageBadge(input: {
  job_status: PageJobStatus | null;
  outcome: PageOutcome | null;
  target_language: TargetLanguage;
}): PageBadge | null {
  if (input.job_status === 'in_flight') {
    return { kind: 'translating', label: 'Translating' };
  }

  if (input.job_status === 'failed') return { kind: 'failed', label: 'Failed' };
  if (input.job_status !== 'done') return null;

  switch (input.outcome) {
    case 'no_text':
      return { kind: 'no-text', label: 'No text' };
    case 'already_in_target_language':
      return {
        kind: 'already-in-target',
        label: `Already in ${TARGET_LANGUAGE_LABELS[input.target_language]}`
      };
    case 'translated_with_warnings':
      return { kind: 'warnings', label: 'Translated with warnings' };
    default:
      return null;
  }
}
