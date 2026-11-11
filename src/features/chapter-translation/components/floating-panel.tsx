import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  NativeSelect,
  NativeSelectOption
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { TARGET_LANGUAGE_LABELS } from '@/constants/language-labels';
import type { TargetLanguage } from '@/types/target-language';
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Languages,
  Pause,
  Square
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SelectQueueProgress } from '../lib/chapter-queue-reducer';
import {
  FormatProgressText,
  ResolveQueueStatusLabel
} from '../lib/format-queue-text';
import { ResolveErrorMessage } from '../lib/resolve-error-message';
import type { FloatingPanelProps } from '../types/panel';
import type { QueueStatus } from '../types/queue';

const TARGET_LANGUAGE_ENTRIES = Object.entries(TARGET_LANGUAGE_LABELS) as [
  TargetLanguage,
  string
][];

function StatusIcon({ status }: { status: QueueStatus }) {
  switch (status) {
    case 'translating':
      return <Spinner aria-hidden="true" />;
    case 'paused':
      return <Pause aria-hidden="true" className="size-4" />;
    case 'completed':
      return <CircleCheck aria-hidden="true" className="size-4" />;
    case 'error':
      return <CircleAlert aria-hidden="true" className="size-4" />;
    case 'stopped':
      return <Square aria-hidden="true" className="size-4" />;
    default:
      return <Languages aria-hidden="true" className="size-4" />;
  }
}

function StartControls({
  has_cached_translations,
  is_provider_configured,
  OnOpenSettings,
  OnStart
}: Pick<
  FloatingPanelProps,
  | 'has_cached_translations'
  | 'is_provider_configured'
  | 'OnOpenSettings'
  | 'OnStart'
>) {
  if (!is_provider_configured) {
    return (
      <Alert>
        <AlertDescription className="flex flex-col gap-2">
          Set up a provider in Settings.
          <Button onClick={OnOpenSettings}>Open settings</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => OnStart(false)}>Translate chapter</Button>
      {has_cached_translations ? (
        <Button variant="outline" onClick={() => OnStart(true)}>
          Retranslate chapter
        </Button>
      ) : null}
    </div>
  );
}

function QueueProgressBlock({
  progress,
  counter_text
}: {
  progress: ReturnType<typeof SelectQueueProgress>;
  counter_text: string;
}) {
  return (
    <>
      <Progress
        aria-label="Chapter progress"
        value={
          progress.total_count === 0
            ? 0
            : (progress.finished_count / progress.total_count) * 100
        }
      />
      <p className="text-sm">{counter_text}</p>
    </>
  );
}

function AutoTranslateField({
  auto_translate,
  OnAutoTranslateChange
}: Pick<FloatingPanelProps, 'OnAutoTranslateChange'> & {
  auto_translate: NonNullable<FloatingPanelProps['auto_translate']>;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id="mt-auto-translate"
        checked={auto_translate.is_enabled}
        disabled={auto_translate.is_saving}
        onCheckedChange={checked => OnAutoTranslateChange(checked === true)}
      />
      <FieldLabel htmlFor="mt-auto-translate">
        Auto-translate this series
      </FieldLabel>
    </Field>
  );
}

function PanelControls(props: FloatingPanelProps) {
  const { queue_state, target_language } = props;
  const { status, stop_error_code, is_cache_only } = queue_state;
  const progress = SelectQueueProgress(queue_state);
  const { counter_text, summary_text } = FormatProgressText(
    progress,
    is_cache_only
  );
  const is_running = status === 'translating' || status === 'paused';
  // A cache-only run keeps the start buttons, so a full run can replace it
  // (spec 0005 §6.3).
  const is_full_run = is_running && !is_cache_only;
  const is_cache_only_run = status === 'translating' && is_cache_only;
  const stop_error =
    status === 'error' && stop_error_code
      ? ResolveErrorMessage(stop_error_code)
      : null;
  const start_controls = (
    <StartControls
      has_cached_translations={props.has_cached_translations}
      is_provider_configured={props.is_provider_configured}
      OnOpenSettings={props.OnOpenSettings}
      OnStart={props.OnStart}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="mt-target-language">Target</FieldLabel>
        <NativeSelect
          id="mt-target-language"
          value={target_language}
          disabled={status === 'translating'}
          onChange={event =>
            props.OnTargetLanguageChange(event.target.value as TargetLanguage)
          }
        >
          {TARGET_LANGUAGE_ENTRIES.map(([language, label]) => (
            <NativeSelectOption key={language} value={language}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {is_full_run ? (
        <div className="flex flex-col gap-2">
          <QueueProgressBlock progress={progress} counter_text={counter_text} />
          <p className="text-muted-foreground text-xs">{summary_text}</p>
          <div className="flex gap-2">
            {status === 'translating' ? (
              <Button onClick={props.OnPause}>Pause</Button>
            ) : (
              <Button onClick={props.OnResume}>Resume</Button>
            )}
            <Button variant="outline" onClick={props.OnStop}>
              Stop
            </Button>
          </div>
        </div>
      ) : is_cache_only_run ? (
        <div className="flex flex-col gap-2">
          <QueueProgressBlock progress={progress} counter_text={counter_text} />
          {start_controls}
          <Button variant="outline" onClick={props.OnStop}>
            Stop
          </Button>
        </div>
      ) : (
        <>
          {start_controls}
          {status === 'completed' || status === 'stopped' ? (
            <p className="text-muted-foreground text-xs">{summary_text}</p>
          ) : null}
        </>
      )}
      {stop_error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-2">
            {stop_error.message}
            {stop_error.action === 'open-settings' ? (
              <Button variant="outline" onClick={props.OnOpenSettings}>
                Open settings
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {props.auto_translate ? (
        <AutoTranslateField
          auto_translate={props.auto_translate}
          OnAutoTranslateChange={props.OnAutoTranslateChange}
        />
      ) : null}
      {props.preload_status_text ? (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {props.preload_status_text}
        </p>
      ) : null}
      <Field orientation="horizontal">
        <Checkbox
          id="mt-show-original"
          checked={props.is_showing_original}
          onCheckedChange={checked =>
            props.OnShowOriginalChange(checked === true)
          }
        />
        <FieldLabel htmlFor="mt-show-original">Show original</FieldLabel>
      </Field>
    </div>
  );
}

export function FloatingPanel(props: FloatingPanelProps) {
  const { queue_state, is_expanded, header_text, confirmation } = props;
  const { counter_text } = FormatProgressText(
    SelectQueueProgress(queue_state),
    queue_state.is_cache_only
  );
  const status_label = ResolveQueueStatusLabel(queue_state);
  const has_confirmation = confirmation !== null;
  const card_ref = useRef<HTMLDivElement>(null);
  const had_confirmation_ref = useRef(false);
  const should_focus_toggle_ref = useRef(false);

  // Closing the confirmation unmounts the focused control, so focus moves to
  // the panel instead of falling back to the page body.
  useEffect(() => {
    if (had_confirmation_ref.current && !has_confirmation) {
      card_ref.current?.focus();
    }

    had_confirmation_ref.current = has_confirmation;
  }, [has_confirmation]);

  const FocusToggleAfterCollapse = (element: HTMLButtonElement | null) => {
    if (!element || !should_focus_toggle_ref.current) return;

    should_focus_toggle_ref.current = false;
    element.focus();
  };

  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 font-sans">
      {is_expanded ? (
        <Card
          ref={card_ref}
          size="sm"
          className="focus-visible:ring-ring/50 w-80 outline-none focus-visible:ring-[3px]"
          tabIndex={-1}
        >
          <CardHeader className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate">{header_text}</CardTitle>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <StatusIcon status={queue_state.status} />
                {status_label}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Collapse"
              aria-expanded={true}
              onClick={() => {
                should_focus_toggle_ref.current = true;
                props.OnExpandedChange(false);
              }}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent>
            {confirmation ?? <PanelControls {...props} />}
          </CardContent>
        </Card>
      ) : (
        <Button
          ref={FocusToggleAfterCollapse}
          size="icon-lg"
          aria-label="Open Manga Translator"
          aria-expanded={false}
          onClick={() => props.OnExpandedChange(true)}
        >
          <Languages aria-hidden="true" />
        </Button>
      )}
      <p className="sr-only" aria-live="polite">
        {`${status_label}. ${counter_text}`}
      </p>
    </div>
  );
}
