import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type {
  SummarizeChapterMessage,
  SummarizeChapterResponse
} from '@/features/chapter-translation';
import {
  CompareChapterNumbers,
  TEXT_LIMITS,
  UpdateChapterSummaryText,
  UpdateSeriesSynopsis
} from '@/features/memory';
import { SendRuntimeMessage } from '@/lib/messaging';
import type { ChapterRecord, SeriesRecord } from '@/services/database';
import { useState } from 'react';
import { SAVE_FAILED_MESSAGE } from '../constants/memory-manager';
import { DescribeSummarizeError } from '../lib/describe-summarize-error';

const URL_CHAPTER_PREFIX = 'url:';

type ChapterListProps = {
  series: SeriesRecord;
  chapters: ChapterRecord[];
  OnChanged: () => void;
};

// The draft follows the saved text whenever a reload brings a new value. A
// failed save resets the draft itself, because the saved text is unchanged.
function UseSyncedDraft(saved_text: string) {
  const [draft, set_draft] = useState(saved_text);
  const [synced_text, set_synced_text] = useState(saved_text);

  if (synced_text !== saved_text) {
    set_synced_text(saved_text);
    set_draft(saved_text);
  }

  return [draft, set_draft] as const;
}

function DescribeChapter(chapter: ChapterRecord): string {
  return chapter.chapter_number.startsWith(URL_CHAPTER_PREFIX)
    ? chapter.chapter_label
    : `Chapter ${chapter.chapter_number}`;
}

function SynopsisField({
  series,
  OnSaved,
  OnSaveFailed
}: {
  series: SeriesRecord;
  OnSaved: () => void;
  OnSaveFailed: () => void;
}) {
  const [draft, set_draft] = UseSyncedDraft(series.synopsis_en);

  async function SaveSynopsis() {
    const trimmed_draft = draft.trim();

    if (trimmed_draft === series.synopsis_en) return;

    try {
      await UpdateSeriesSynopsis(series.series_id, trimmed_draft);
      OnSaved();
    } catch {
      set_draft(series.synopsis_en);
      OnSaveFailed();
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor="series-synopsis">Series synopsis</FieldLabel>
      <Textarea
        id="series-synopsis"
        rows={4}
        maxLength={TEXT_LIMITS.summary}
        value={draft}
        onBlur={() => void SaveSynopsis()}
        onChange={event => set_draft(event.target.value)}
      />
    </Field>
  );
}

function ChapterItem({
  chapter,
  OnSaved,
  OnSaveFailed
}: {
  chapter: ChapterRecord;
  OnSaved: () => void;
  OnSaveFailed: () => void;
}) {
  const [draft, set_draft] = UseSyncedDraft(chapter.summary_en);
  const [is_summarizing, set_is_summarizing] = useState(false);
  const [summarize_error, set_summarize_error] = useState<string | null>(null);
  const is_summarized = chapter.status === 'summarized';

  async function SaveSummary() {
    const trimmed_draft = draft.trim();

    if (trimmed_draft === chapter.summary_en) return;

    try {
      await UpdateChapterSummaryText(
        chapter.series_id,
        chapter.chapter_number,
        trimmed_draft
      );
      OnSaved();
    } catch {
      set_draft(chapter.summary_en);
      OnSaveFailed();
    }
  }

  async function SummarizeAgain() {
    const message: SummarizeChapterMessage = {
      action: 'summarize-chapter',
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number
    };

    set_is_summarizing(true);
    set_summarize_error(null);

    try {
      const response =
        await SendRuntimeMessage<SummarizeChapterResponse>(message);

      if (response.success) {
        OnSaved();
      } else {
        set_summarize_error(DescribeSummarizeError(response.error_code));
      }
    } catch {
      set_summarize_error(DescribeSummarizeError('PROVIDER_UNAVAILABLE'));
    } finally {
      set_is_summarizing(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{DescribeChapter(chapter)}</h3>
          <Badge variant={is_summarized ? 'secondary' : 'outline'}>
            {is_summarized ? 'Summarized' : 'In progress'}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={is_summarizing}
          onClick={() => void SummarizeAgain()}
        >
          {is_summarizing ? (
            <>
              <Spinner aria-hidden="true" />
              Summarizing…
            </>
          ) : (
            'Summarize again'
          )}
        </Button>
      </div>
      <Textarea
        rows={3}
        maxLength={TEXT_LIMITS.summary}
        value={draft}
        aria-label={`Summary of chapter ${chapter.chapter_number}`}
        onBlur={() => void SaveSummary()}
        onChange={event => set_draft(event.target.value)}
      />
      {summarize_error ? (
        <p role="alert" className="text-destructive text-sm">
          {summarize_error}
        </p>
      ) : null}
    </li>
  );
}

export function ChapterList({ series, chapters, OnChanged }: ChapterListProps) {
  const [error_message, set_error_message] = useState<string | null>(null);
  const sorted_chapters = [...chapters].sort(CompareChapterNumbers);

  function HandleSaved() {
    set_error_message(null);
    OnChanged();
  }

  function HandleSaveFailed() {
    set_error_message(SAVE_FAILED_MESSAGE);
    OnChanged();
  }

  return (
    <div className="flex flex-col gap-6">
      <SynopsisField
        series={series}
        OnSaved={HandleSaved}
        OnSaveFailed={HandleSaveFailed}
      />
      {error_message ? (
        <p role="alert" className="text-destructive text-sm">
          {error_message}
        </p>
      ) : null}
      {sorted_chapters.length === 0 ? (
        <Empty>
          <EmptyDescription>No chapters yet.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted_chapters.map(chapter => (
            <ChapterItem
              key={chapter.chapter_number}
              chapter={chapter}
              OnSaved={HandleSaved}
              OnSaveFailed={HandleSaveFailed}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
