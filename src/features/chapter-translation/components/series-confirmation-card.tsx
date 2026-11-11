import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption
} from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { SERIES_MATCH_THRESHOLD } from '@/features/series-detection';
import { useEffect, useRef, useState } from 'react';
import {
  BuildSeriesChoiceOptions,
  IsConfidentMatch
} from '../lib/build-series-choice-options';
import { FormatMatchPercent } from '../lib/format-queue-text';
import type { SeriesConfirmationCardProps } from '../types/panel';

export function SeriesConfirmationCard({
  all_series,
  candidates,
  chapter_number,
  detected_title,
  error_message,
  is_submitting,
  mode,
  OnCancel,
  OnConfirmExisting,
  OnCreateNew
}: SeriesConfirmationCardProps) {
  const [chapter_number_text, set_chapter_number_text] =
    useState(chapter_number);
  const [selected_series_id, set_selected_series_id] = useState('');
  const [new_title, set_new_title] = useState(detected_title);
  const card_ref = useRef<HTMLDivElement>(null);
  const trimmed_chapter = chapter_number_text.trim();
  const is_chapter_missing = trimmed_chapter === '';
  const is_disabled = is_submitting || is_chapter_missing;
  const best_candidate = [...candidates].sort(
    (left, right) => right.score - left.score
  )[0];
  const is_confident =
    mode === 'confirm' &&
    best_candidate !== undefined &&
    IsConfidentMatch(candidates, SERIES_MATCH_THRESHOLD);
  const { ranked, others } = BuildSeriesChoiceOptions(candidates, all_series);

  useEffect(() => {
    card_ref.current
      ?.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
      )
      ?.focus();
  }, []);

  return (
    <Card ref={card_ref} size="sm">
      <CardHeader>
        <CardTitle>
          {is_confident ? (
            <>
              {`Is this "${best_candidate.title}"?`}{' '}
              <span className="text-muted-foreground font-normal">
                {`(${FormatMatchPercent(best_candidate.score)}% match)`}
              </span>
            </>
          ) : (
            'Which series is this?'
          )}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {`Detected: "${detected_title}"`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {is_confident ? (
          <Button
            disabled={is_disabled}
            onClick={() =>
              OnConfirmExisting(best_candidate.series_id, trimmed_chapter)
            }
          >
            Yes, link
          </Button>
        ) : null}
        <Field>
          <FieldLabel htmlFor="mt-chapter-number">Chapter</FieldLabel>
          <Input
            id="mt-chapter-number"
            value={chapter_number_text}
            aria-invalid={is_chapter_missing || undefined}
            onChange={event => set_chapter_number_text(event.target.value)}
          />
          {is_chapter_missing ? (
            <FieldError>Enter a chapter number.</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="mt-series-choice">Choose another</FieldLabel>
          <NativeSelect
            id="mt-series-choice"
            value={selected_series_id}
            disabled={is_submitting}
            onChange={event => set_selected_series_id(event.target.value)}
          >
            <NativeSelectOption value="">Select a series</NativeSelectOption>
            {ranked.length > 0 ? (
              <NativeSelectOptGroup label="Best matches">
                {ranked.map(choice => (
                  <NativeSelectOption
                    key={choice.series_id}
                    value={choice.series_id}
                  >
                    {choice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ) : null}
            {others.length > 0 ? (
              <NativeSelectOptGroup label="All series">
                {others.map(choice => (
                  <NativeSelectOption
                    key={choice.series_id}
                    value={choice.series_id}
                  >
                    {choice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ) : null}
          </NativeSelect>
          <Button
            variant="outline"
            disabled={is_disabled || selected_series_id === ''}
            onClick={() =>
              OnConfirmExisting(selected_series_id, trimmed_chapter)
            }
          >
            Link selected
          </Button>
        </Field>
        <Field>
          <FieldLabel htmlFor="mt-new-series-title">
            New series title
          </FieldLabel>
          <Input
            id="mt-new-series-title"
            value={new_title}
            disabled={is_submitting}
            onChange={event => set_new_title(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={is_disabled || new_title.trim() === ''}
            onClick={() => OnCreateNew(new_title.trim(), trimmed_chapter)}
          >
            Create new series
          </Button>
        </Field>
        {error_message ? <FieldError>{error_message}</FieldError> : null}
        {is_submitting ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner aria-hidden="true" />
            Linking…
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button variant="ghost" disabled={is_submitting} onClick={OnCancel}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}
