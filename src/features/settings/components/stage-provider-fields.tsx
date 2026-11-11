import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { PipelineStage, ProviderName } from '@/services/ai-provider';
import { RefreshCw } from 'lucide-react';
import type { ModelListState } from '../hooks/use-model-list';
import { BuildModelOptions } from '../lib/build-model-options';
import { BuildReasoningOptions } from '../lib/build-reasoning-options';
import {
  ChangeStageProvider,
  ChangeStageReasoningEffort,
  PickStageModel
} from '../lib/change-stage-settings';
import { ResolveStageProvider } from '../lib/stage-provider';
import type { Settings } from '../types/settings';

const PROVIDER_OPTIONS: { value: ProviderName; label: string }[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'ollama', label: 'Ollama' }
];
const VALID_PROVIDERS: ReadonlySet<string> = new Set(
  PROVIDER_OPTIONS.map(option => option.value)
);

type StageProviderFieldsProps = {
  stage: PipelineStage;
  settings: Settings;
  // The model list of the provider these fields show. A stage that mirrors
  // image reading receives the image-reading list.
  model_list: ModelListState;
  is_disabled: boolean;
  OnSettingsChange: (next_settings: Settings) => void;
};

export function StageProviderFields({
  stage,
  settings,
  model_list,
  is_disabled,
  OnSettingsChange
}: StageProviderFieldsProps) {
  const stage_provider = is_disabled
    ? ResolveStageProvider(settings, stage)
    : settings[stage];
  const { models, is_loading, error_message, Refresh } = model_list;
  const { options, is_vision_unknown } = BuildModelOptions({
    models,
    stage,
    current_model: stage_provider.model
  });
  const reasoning_options = BuildReasoningOptions({
    provider: stage_provider.provider,
    models,
    current_model: stage_provider.model,
    current_effort: stage_provider.reasoning_effort
  });
  const provider_id = `${stage}-provider`;
  const model_id = `${stage}-model`;
  const reasoning_id = `${stage}-reasoning-effort`;
  const reasoning_warning_id = `${stage}-reasoning-effort-warning`;

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={provider_id}>Provider</FieldLabel>
        <Select
          value={stage_provider.provider}
          disabled={is_disabled}
          onValueChange={next_provider => {
            if (VALID_PROVIDERS.has(next_provider)) {
              OnSettingsChange(
                ChangeStageProvider(
                  settings,
                  stage,
                  next_provider as ProviderName
                )
              );
            }
          }}
        >
          <SelectTrigger id={provider_id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {PROVIDER_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={model_id}>Model</FieldLabel>
        <div className="flex items-center gap-2">
          {/* Radix items cannot be empty, so "no model" is a placeholder
              and can no longer be picked back (plan 0026). */}
          <Select
            value={stage_provider.model}
            disabled={is_disabled}
            onValueChange={next_model =>
              OnSettingsChange(
                PickStageModel(settings, stage, next_model, models)
              )
            }
          >
            <SelectTrigger id={model_id} className="min-w-0 flex-1">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent position="popper">
              {options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh model list"
            disabled={is_disabled || is_loading}
            onClick={Refresh}
          >
            {is_loading ? (
              <Spinner aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
          </Button>
        </div>
        {is_vision_unknown ? (
          <FieldDescription>
            This provider doesn&apos;t report image support. Choose a
            vision-capable model.
          </FieldDescription>
        ) : null}
        {/* A mirrored stage shares the image-reading list, whose section
            already shows its load error. */}
        {error_message && !is_disabled ? (
          <p role="alert" className="text-destructive text-sm">
            {error_message}
          </p>
        ) : null}
      </Field>
      {reasoning_options.is_visible ? (
        <Field>
          <FieldLabel htmlFor={reasoning_id}>Thinking</FieldLabel>
          <Select
            value={stage_provider.reasoning_effort}
            disabled={is_disabled}
            onValueChange={next_effort => {
              const picked_option = reasoning_options.options.find(
                option => option.value === next_effort
              );

              if (picked_option) {
                OnSettingsChange(
                  ChangeStageReasoningEffort(
                    settings,
                    stage,
                    picked_option.value
                  )
                );
              }
            }}
          >
            <SelectTrigger
              id={reasoning_id}
              className="w-full"
              aria-describedby={
                reasoning_options.is_current_unsupported
                  ? reasoning_warning_id
                  : undefined
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {reasoning_options.options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {reasoning_options.is_current_unsupported ? (
            <FieldDescription id={reasoning_warning_id}>
              This model doesn&apos;t support the selected Thinking level.
              Choose another one.
            </FieldDescription>
          ) : null}
        </Field>
      ) : null}
    </div>
  );
}
