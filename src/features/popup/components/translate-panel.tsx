import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type {
  OpenSeriesPickerMessage,
  StartChapterTranslationMessage,
  TabCommandResponse
} from '@/features/chapter-translation';
import {
  VALID_TARGET_LANGUAGES,
  type TargetLanguage
} from '@/features/settings';
import { SendTabMessage } from '@/lib/messaging';
import { CircleCheck, ExternalLink, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { DescribePageStatus } from '../lib/describe-page-status';
import { DescribeProviderStatus } from '../lib/describe-provider-status';
import type { TranslatePanelProps } from '../types/props';

const COMMAND_FAILED_MESSAGE =
  "The page didn't respond. Reload the page and try again.";

const TARGET_LANGUAGE_OPTIONS: { value: TargetLanguage; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' }
];

type TabCommandMessage =
  StartChapterTranslationMessage | OpenSeriesPickerMessage;

function ProviderRow({ settings }: Pick<TranslatePanelProps, 'settings'>) {
  const { provider_label, is_ready, status_label } =
    DescribeProviderStatus(settings);

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{`Provider: ${provider_label}`}</span>
      <Badge variant={is_ready ? 'secondary' : 'destructive'}>
        {is_ready ? (
          <CircleCheck aria-hidden="true" />
        ) : (
          <PlugZap aria-hidden="true" />
        )}
        {status_label}
      </Badge>
    </div>
  );
}

export function TranslatePanel({
  settings,
  tab_id,
  status,
  is_loading,
  OnTargetLanguageChange
}: TranslatePanelProps) {
  const [command_error_message, set_command_error_message] = useState<
    string | null
  >(null);
  const [is_sending, set_is_sending] = useState(false);
  const view = DescribePageStatus(status);

  async function SendCommand(message: TabCommandMessage): Promise<void> {
    if (tab_id === null) return;

    set_is_sending(true);
    set_command_error_message(null);

    try {
      const response = await SendTabMessage<TabCommandResponse | undefined>(
        tab_id,
        message
      );

      if (response?.accepted === true) {
        window.close();

        return;
      }

      set_command_error_message(COMMAND_FAILED_MESSAGE);
    } catch {
      set_command_error_message(COMMAND_FAILED_MESSAGE);
    } finally {
      set_is_sending(false);
    }
  }

  function RenderPageSection() {
    if (is_loading) {
      return (
        <p
          role="status"
          className="text-muted-foreground flex items-center gap-2 text-sm"
        >
          <Spinner aria-hidden="true" />
          Checking this page…
        </p>
      );
    }

    if (!view.is_available) {
      return (
        <Alert>
          <AlertTitle>This page can&apos;t be translated</AlertTitle>
          <AlertDescription>
            Open a manga chapter page. If the page was open before the extension
            was installed or updated, reload it.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{`Series: ${view.series_label}`}</span>
            <Button
              variant="link"
              size="sm"
              disabled={is_sending}
              onClick={() => void SendCommand({ action: 'open-series-picker' })}
            >
              Change
            </Button>
          </div>
          <p>{`Chapter: ${view.chapter_label}`}</p>
        </div>
        <RadioGroup
          value={settings.target_language}
          aria-label="Target language"
          className="flex gap-4"
          onValueChange={next_language => {
            if (VALID_TARGET_LANGUAGES.has(next_language)) {
              OnTargetLanguageChange(next_language as TargetLanguage);
            }
          }}
        >
          {TARGET_LANGUAGE_OPTIONS.map(option => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                id={`target-language-${option.value}`}
                value={option.value}
              />
              <Label htmlFor={`target-language-${option.value}`}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex flex-col gap-2">
          <Button
            disabled={!view.can_translate || is_sending}
            onClick={() =>
              void SendCommand({
                action: 'start-chapter-translation',
                is_retranslation: false
              })
            }
          >
            Translate chapter
          </Button>
          {view.can_retranslate ? (
            <Button
              variant="outline"
              disabled={is_sending}
              onClick={() =>
                void SendCommand({
                  action: 'start-chapter-translation',
                  is_retranslation: true
                })
              }
            >
              Retranslate chapter
            </Button>
          ) : null}
        </div>
        {command_error_message ? (
          <p role="alert" className="text-destructive text-xs">
            {command_error_message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {RenderPageSection()}
        <Separator />
        <ProviderRow settings={settings} />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          <ExternalLink aria-hidden="true" />
          Manage memory
        </Button>
      </CardContent>
    </Card>
  );
}
