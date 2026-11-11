import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { VALID_THEMES, type Theme } from '@/features/theme';
import type { ProviderName } from '@/services/ai-provider';
import { useState, type ReactNode } from 'react';
import {
  MAX_NEXT_CHAPTER_PRELOAD_COUNT,
  VALID_READING_DIRECTIONS,
  VALID_TARGET_LANGUAGES
} from '../constants/settings';
import { UseConnectionTest } from '../hooks/use-connection-test';
import { UseModelList } from '../hooks/use-model-list';
import { SetTranslationSameAsImageReading } from '../lib/change-stage-settings';
import { IsNextChapterPreloadCount } from '../lib/merge-settings';
import { IsTranslationSameAsImageReading } from '../lib/stage-provider';
import { ValidateOllamaBaseUrl } from '../lib/validate-ollama-base-url';
import { ResolveVisibleConnections } from '../lib/visible-connections';
import type {
  ReadingDirection,
  Settings,
  TargetLanguage
} from '../types/settings';
import { ImageReaderField } from './image-reader-field';
import { StageProviderFields } from './stage-provider-fields';

type SettingsFormProps = {
  settings: Settings;
  save_error_message: string | null;
  OnSettingsChange: (next_settings: Settings) => void;
};

const TARGET_LANGUAGE_OPTIONS: { value: TargetLanguage; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' }
];
const READING_DIRECTION_OPTIONS: { value: ReadingDirection; label: string }[] =
  [
    { value: 'auto', label: 'Auto' },
    { value: 'rtl', label: 'Right to left' },
    { value: 'ltr', label: 'Left to right' }
  ];
const NEXT_CHAPTER_PRELOAD_OPTIONS: { value: string; label: string }[] =
  Array.from({ length: MAX_NEXT_CHAPTER_PRELOAD_COUNT + 1 }, (_, count) => ({
    value: String(count),
    label: count === 0 ? 'Off' : String(count)
  }));
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

// The input with its Test button beside it and the result below.
function ConnectionTestRow({
  provider,
  ReadSettings,
  children
}: {
  provider: ProviderName;
  ReadSettings: () => Settings | null;
  children: ReactNode;
}) {
  const { status, message, RunTest } = UseConnectionTest();

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          variant="outline"
          disabled={status === 'testing'}
          onClick={() => {
            const settings = ReadSettings();

            if (settings) RunTest(provider, settings);
          }}
        >
          Test
        </Button>
      </div>
      <p
        role="status"
        className={status === 'failed' ? 'text-destructive text-sm' : 'text-sm'}
      >
        {message}
      </p>
    </>
  );
}

function ConnectionFields({
  settings,
  OnSettingsChange
}: Omit<SettingsFormProps, 'save_error_message'>) {
  const [api_key_draft, set_api_key_draft] = useState(
    settings.openrouter_api_key
  );
  const [ollama_url_draft, set_ollama_url_draft] = useState(
    settings.ollama_base_url
  );
  const [ollama_url_error, set_ollama_url_error] = useState<string | null>(
    null
  );

  function SaveApiKey(): Settings {
    const next_settings = {
      ...settings,
      openrouter_api_key: api_key_draft.trim()
    };

    if (next_settings.openrouter_api_key !== settings.openrouter_api_key) {
      OnSettingsChange(next_settings);
    }

    return next_settings;
  }

  function SaveOllamaUrl(): Settings | null {
    const validation = ValidateOllamaBaseUrl(ollama_url_draft);

    if (!validation.is_valid) {
      set_ollama_url_error(validation.error);

      return null;
    }

    set_ollama_url_error(null);
    set_ollama_url_draft(validation.url);

    const next_settings = { ...settings, ollama_base_url: validation.url };

    if (validation.url !== settings.ollama_base_url) {
      OnSettingsChange(next_settings);
    }

    return next_settings;
  }

  const visible_providers = ResolveVisibleConnections(settings);

  return (
    <FieldGroup>
      {visible_providers.includes('openrouter') ? (
        <Field>
          <FieldLabel htmlFor="openrouter-api-key">
            OpenRouter API key
          </FieldLabel>
          {/* The test uses the draft, which may not have saved yet. */}
          <ConnectionTestRow provider="openrouter" ReadSettings={SaveApiKey}>
            <Input
              id="openrouter-api-key"
              type="password"
              autoComplete="off"
              value={api_key_draft}
              onBlur={SaveApiKey}
              onChange={event => set_api_key_draft(event.target.value)}
            />
          </ConnectionTestRow>
        </Field>
      ) : null}
      {visible_providers.includes('ollama') ? (
        <Field data-invalid={ollama_url_error ? true : undefined}>
          <FieldLabel htmlFor="ollama-base-url">Ollama URL</FieldLabel>
          <ConnectionTestRow provider="ollama" ReadSettings={SaveOllamaUrl}>
            <Input
              id="ollama-base-url"
              value={ollama_url_draft}
              aria-invalid={ollama_url_error ? true : undefined}
              aria-describedby={
                ollama_url_error ? 'ollama-base-url-error' : undefined
              }
              onBlur={() => void SaveOllamaUrl()}
              onChange={event => set_ollama_url_draft(event.target.value)}
            />
          </ConnectionTestRow>
          {ollama_url_error ? (
            <FieldError id="ollama-base-url-error">
              {ollama_url_error}
            </FieldError>
          ) : null}
        </Field>
      ) : null}
    </FieldGroup>
  );
}

function ReadingFields({
  settings,
  OnSettingsChange
}: Omit<SettingsFormProps, 'save_error_message'>) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel id="target-language-label">Target language</FieldLabel>
        <RadioGroup
          value={settings.target_language}
          aria-labelledby="target-language-label"
          className="flex gap-4"
          onValueChange={next_language => {
            if (VALID_TARGET_LANGUAGES.has(next_language)) {
              OnSettingsChange({
                ...settings,
                target_language: next_language as TargetLanguage
              });
            }
          }}
        >
          {TARGET_LANGUAGE_OPTIONS.map(option => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                id={`settings-target-language-${option.value}`}
                value={option.value}
              />
              <Label htmlFor={`settings-target-language-${option.value}`}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="reading-direction">Reading direction</FieldLabel>
        <Select
          value={settings.reading_direction}
          onValueChange={next_direction => {
            if (VALID_READING_DIRECTIONS.has(next_direction)) {
              OnSettingsChange({
                ...settings,
                reading_direction: next_direction as ReadingDirection
              });
            }
          }}
        >
          <SelectTrigger id="reading-direction" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {READING_DIRECTION_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="next-chapter-preload-count">
          Next chapters to prepare
        </FieldLabel>
        <Select
          value={String(settings.next_chapter_preload_count)}
          onValueChange={next_value => {
            const next_count = Number(next_value);

            if (IsNextChapterPreloadCount(next_count)) {
              OnSettingsChange({
                ...settings,
                next_chapter_preload_count: next_count
              });
            }
          }}
        >
          <SelectTrigger
            id="next-chapter-preload-count"
            className="w-full"
            aria-describedby="next-chapter-preload-count-description"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {NEXT_CHAPTER_PRELOAD_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription id="next-chapter-preload-count-description">
          After a chapter of an auto-translate series finishes, translate the
          first pages of the next chapters in a minimized window.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function AppearanceFields({
  settings,
  OnSettingsChange
}: Omit<SettingsFormProps, 'save_error_message'>) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="settings-theme">Theme</FieldLabel>
        <Select
          value={settings.theme}
          onValueChange={next_theme => {
            if (VALID_THEMES.has(next_theme)) {
              OnSettingsChange({ ...settings, theme: next_theme as Theme });
            }
          }}
        >
          <SelectTrigger id="settings-theme" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {THEME_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

type SettingsCardProps = {
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
};

function SettingsCard({
  title,
  description,
  className,
  children
}: SettingsCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsForm({
  settings,
  save_error_message,
  OnSettingsChange
}: SettingsFormProps) {
  const is_ai_reader = settings.image_reading.reader === 'ai';
  const is_translation_mirrored = IsTranslationSameAsImageReading(settings);
  // Both lists stay mounted, as hooks must. A list loads only when its
  // refresh button is selected, so the OCR reader calls no provider here.
  const image_reading_model_list = UseModelList(
    settings.image_reading.provider,
    settings
  );
  const translation_model_list = UseModelList(
    settings.translation.provider,
    settings
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SettingsCard
        title="Image reading"
        description="How text is read from manga pages."
      >
        <ImageReaderField
          settings={settings}
          OnSettingsChange={OnSettingsChange}
        />
        {is_ai_reader ? (
          <StageProviderFields
            stage="image_reading"
            settings={settings}
            model_list={image_reading_model_list}
            is_disabled={false}
            OnSettingsChange={OnSettingsChange}
          />
        ) : null}
      </SettingsCard>
      <SettingsCard
        title="Translation"
        description="The AI model that translates the text."
      >
        {is_ai_reader ? (
          <Field orientation="horizontal">
            <Checkbox
              id="translation-same-as-image-reading"
              checked={settings.translation.is_same_as_image_reading}
              onCheckedChange={checked =>
                OnSettingsChange(
                  SetTranslationSameAsImageReading(settings, checked === true)
                )
              }
            />
            <FieldLabel htmlFor="translation-same-as-image-reading">
              Same as image reading
            </FieldLabel>
          </Field>
        ) : null}
        {/* While it mirrors image reading, the translation stage shows the
            image-reading list, so its disabled Model and Thinking fields
            show what stage 2 sends. */}
        <StageProviderFields
          stage="translation"
          settings={settings}
          model_list={
            is_translation_mirrored
              ? image_reading_model_list
              : translation_model_list
          }
          is_disabled={is_translation_mirrored}
          OnSettingsChange={OnSettingsChange}
        />
      </SettingsCard>
      <SettingsCard
        title="Connections"
        description="Where the extension reaches each AI provider."
        className="md:col-span-2"
      >
        <ConnectionFields
          settings={settings}
          OnSettingsChange={OnSettingsChange}
        />
      </SettingsCard>
      <SettingsCard
        title="Reading"
        description="How chapters are translated while you read."
      >
        <ReadingFields
          settings={settings}
          OnSettingsChange={OnSettingsChange}
        />
      </SettingsCard>
      <SettingsCard title="Appearance" description="How this extension looks.">
        <AppearanceFields
          settings={settings}
          OnSettingsChange={OnSettingsChange}
        />
      </SettingsCard>
      {save_error_message ? (
        <p role="alert" className="text-destructive text-sm md:col-span-2">
          {save_error_message}
        </p>
      ) : null}
    </div>
  );
}
