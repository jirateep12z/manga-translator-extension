import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import {
  MAX_ADDRESS_TERMS,
  TEXT_LIMITS,
  UpdateEntityByUser
} from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import type { EntityRecord } from '@/services/database';
import { Bot, Lock, Plus, Trash, UserPen } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  LANGUAGE_LABELS,
  SAVE_FAILED_MESSAGE,
  TARGET_LANGUAGES
} from '../constants/memory-manager';
import {
  BuildSpeechSavePatch,
  ListListenerOptions,
  TermErrorKey,
  ToSpeechDraft,
  ValidateSpeechDraft,
  type SpeechDraft,
  type SpeechDraftErrors,
  type SpeechTermDraft
} from '../lib/speech-draft';

export type SpeechTarget = { entity_id: string; source_name: string };

type SpeechDialogProps = {
  target: SpeechTarget | null;
  entities: EntityRecord[];
  default_target_language: TargetLanguage;
  OnClose: () => void;
  OnCloseAutoFocus?: (event: Event) => void;
  OnSaved: () => void;
};

type SpeechFormProps = {
  entity: EntityRecord;
  entities: EntityRecord[];
  language: TargetLanguage;
  OnClose: () => void;
  OnSaved: () => void;
};

type Origin = 'ai' | 'user' | undefined;

function OriginIndicator({ origin }: { origin: Origin }) {
  if (origin === undefined) return null;

  const OriginIcon = origin === 'user' ? UserPen : Bot;
  const origin_label = origin === 'user' ? 'User-edited' : 'AI-added';

  return (
    <span title={origin_label} className="text-muted-foreground shrink-0">
      <OriginIcon aria-hidden="true" className="size-4" />
      <span className="sr-only">{origin_label}</span>
    </span>
  );
}

function LockToggle({
  label,
  is_locked,
  is_disabled = false,
  OnChange
}: {
  label: string;
  is_locked: boolean;
  is_disabled?: boolean;
  OnChange: (is_locked: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      aria-label={label}
      // An empty value saves no lock, so a disabled toggle shows unpressed.
      pressed={is_locked && !is_disabled}
      disabled={is_disabled}
      onPressedChange={OnChange}
    >
      <Lock aria-hidden="true" />
    </Toggle>
  );
}

function SpeechValueField({
  input_id,
  label,
  value,
  is_disabled = false,
  error_message,
  origin,
  children
}: {
  input_id: string;
  label: string;
  value: { text: string; OnChange: (text: string) => void };
  is_disabled?: boolean;
  error_message: string | undefined;
  origin: Origin;
  children: ReactNode;
}) {
  const error_id = `${input_id}-error`;

  return (
    <Field data-invalid={error_message ? true : undefined}>
      <FieldLabel htmlFor={input_id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={input_id}
          value={value.text}
          maxLength={TEXT_LIMITS.speech_value}
          disabled={is_disabled}
          aria-invalid={error_message ? true : undefined}
          aria-describedby={error_message ? error_id : undefined}
          onChange={event => value.OnChange(event.target.value)}
        />
        <OriginIndicator origin={origin} />
        {children}
      </div>
      {error_message ? (
        <FieldError id={error_id}>{error_message}</FieldError>
      ) : null}
    </Field>
  );
}

function TermRow({
  term_draft,
  listener_options,
  error_message,
  origin,
  OnChange,
  OnRemove
}: {
  term_draft: SpeechTermDraft;
  listener_options: string[];
  error_message: string | undefined;
  origin: Origin;
  OnChange: (term_draft: SpeechTermDraft) => void;
  OnRemove: () => void;
}) {
  const error_id = `speech-term-error-${term_draft.row_id}`;
  const listener_label = term_draft.listener_source_name || 'new row';

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={term_draft.listener_source_name}
          onValueChange={next_listener =>
            OnChange({
              ...term_draft,
              listener_source_name: next_listener
            })
          }
        >
          <SelectTrigger
            aria-label="Listener"
            className="w-40"
            aria-invalid={error_message ? true : undefined}
            aria-describedby={error_message ? error_id : undefined}
          >
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent position="popper">
            {listener_options.map(listener => (
              <SelectItem key={listener} value={listener}>
                {listener}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-32 flex-1"
          value={term_draft.term}
          maxLength={TEXT_LIMITS.address_term}
          aria-label={`Term for ${listener_label}`}
          aria-invalid={error_message ? true : undefined}
          aria-describedby={error_message ? error_id : undefined}
          onChange={event =>
            OnChange({ ...term_draft, term: event.target.value })
          }
        />
        <OriginIndicator origin={origin} />
        <LockToggle
          label="Lock term"
          is_locked={term_draft.is_locked}
          OnChange={is_locked => OnChange({ ...term_draft, is_locked })}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove term"
          onClick={OnRemove}
        >
          <Trash aria-hidden="true" />
        </Button>
      </div>
      {error_message ? (
        <FieldError id={error_id}>{error_message}</FieldError>
      ) : null}
    </li>
  );
}

function SpeechForm({
  entity,
  entities,
  language,
  OnClose,
  OnSaved
}: SpeechFormProps) {
  const stored_profile = entity.speech[language];
  const translation_text = entity.translations[language]?.text ?? '';
  const [initial_draft] = useState<SpeechDraft>(() =>
    ToSpeechDraft(stored_profile, entity.name_variants[language] ?? [])
  );
  const [draft, set_draft] = useState<SpeechDraft>(initial_draft);
  const [errors, set_errors] = useState<SpeechDraftErrors>({});
  const [save_error_message, set_save_error_message] = useState<string | null>(
    null
  );
  const [is_saving, set_is_saving] = useState(false);
  const [new_row_count, set_new_row_count] = useState(0);
  const is_thai = language === 'th';
  const listener_options = ListListenerOptions(
    entities,
    entity.entity_id,
    draft
  );

  function UpdateDraft(changes: Partial<SpeechDraft>) {
    set_draft(current_draft => ({ ...current_draft, ...changes }));
  }

  function UpdateTerm(row_id: string, term_draft: SpeechTermDraft) {
    set_draft(current_draft => ({
      ...current_draft,
      terms: current_draft.terms.map(current_term =>
        current_term.row_id === row_id ? term_draft : current_term
      )
    }));
  }

  function AddTerm() {
    set_draft(current_draft => ({
      ...current_draft,
      terms: [
        ...current_draft.terms,
        {
          row_id: `term-new-${new_row_count}`,
          listener_source_name: '',
          term: '',
          is_locked: false
        }
      ]
    }));
    set_new_row_count(count => count + 1);
  }

  function FindStoredTermOrigin(listener_source_name: string): Origin {
    return stored_profile?.address_terms.find(
      address_term => address_term.listener_source_name === listener_source_name
    )?.origin;
  }

  async function HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const draft_errors = ValidateSpeechDraft(draft);

    set_errors(draft_errors);
    if (Object.keys(draft_errors).length > 0) return;

    set_is_saving(true);
    set_save_error_message(null);

    try {
      const patch = BuildSpeechSavePatch({
        language,
        initial_draft,
        draft,
        has_stored_profile: stored_profile !== undefined
      });

      if (Object.keys(patch).length > 0) {
        await UpdateEntityByUser(entity.entity_id, patch);
      }

      OnClose();
      OnSaved();
    } catch {
      set_save_error_message(SAVE_FAILED_MESSAGE);
    } finally {
      set_is_saving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={HandleSubmit}>
      {is_thai ? (
        <>
          <SpeechValueField
            input_id="speech-self-pronoun"
            label="Self pronoun"
            value={{
              text: draft.self_pronoun_text,
              OnChange: text => UpdateDraft({ self_pronoun_text: text })
            }}
            error_message={errors.self_pronoun}
            origin={stored_profile?.self_pronoun?.origin}
          >
            <LockToggle
              label="Lock self pronoun"
              is_locked={draft.is_self_pronoun_locked}
              is_disabled={draft.self_pronoun_text.trim() === ''}
              OnChange={is_locked =>
                UpdateDraft({ is_self_pronoun_locked: is_locked })
              }
            />
          </SpeechValueField>
          <SpeechValueField
            input_id="speech-sentence-ending"
            label="Sentence ending"
            value={{
              text: draft.sentence_ending_text,
              OnChange: text => UpdateDraft({ sentence_ending_text: text })
            }}
            is_disabled={draft.is_sentence_ending_none}
            error_message={errors.sentence_ending}
            origin={stored_profile?.sentence_ending?.origin}
          >
            <LockToggle
              label="Lock sentence ending"
              is_locked={draft.is_sentence_ending_locked}
              is_disabled={
                !draft.is_sentence_ending_none &&
                draft.sentence_ending_text.trim() === ''
              }
              OnChange={is_locked =>
                UpdateDraft({ is_sentence_ending_locked: is_locked })
              }
            />
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={draft.is_sentence_ending_none}
                onCheckedChange={checked =>
                  UpdateDraft({ is_sentence_ending_none: checked === true })
                }
              />
              None
            </label>
          </SpeechValueField>
        </>
      ) : null}
      <FieldSet>
        <FieldLegend variant="label">Addresses others</FieldLegend>
        {draft.terms.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {draft.terms.map(term_draft => (
              <TermRow
                key={term_draft.row_id}
                term_draft={term_draft}
                listener_options={listener_options}
                error_message={errors[TermErrorKey(term_draft.row_id)]}
                origin={FindStoredTermOrigin(term_draft.listener_source_name)}
                OnChange={next_term => UpdateTerm(term_draft.row_id, next_term)}
                OnRemove={() =>
                  UpdateDraft({
                    terms: draft.terms.filter(
                      current_term => current_term.row_id !== term_draft.row_id
                    )
                  })
                }
              />
            ))}
          </ul>
        ) : null}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.terms.length >= MAX_ADDRESS_TERMS}
            onClick={AddTerm}
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
      </FieldSet>
      {translation_text ? (
        <FieldSet>
          <FieldLegend variant="label">
            {`Known misspellings of "${translation_text}"`}
          </FieldLegend>
          {draft.name_variants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No misspellings recorded.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {draft.name_variants.map(variant => (
                <li
                  key={variant}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{variant}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove misspelling ${variant}`}
                    onClick={() =>
                      UpdateDraft({
                        name_variants: draft.name_variants.filter(
                          current_variant => current_variant !== variant
                        )
                      })
                    }
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </FieldSet>
      ) : null}
      {save_error_message ? (
        <FieldError>{save_error_message}</FieldError>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={OnClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={is_saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function SpeechDialogBody({
  entity,
  entities,
  default_target_language,
  OnClose,
  OnSaved
}: Omit<SpeechDialogProps, 'target'> & { entity: EntityRecord }) {
  const [language, set_language] = useState<TargetLanguage>(
    default_target_language
  );

  return (
    <>
      <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 pr-8">
        <DialogTitle>{`Speech — ${entity.source_name}`}</DialogTitle>
        <Select
          value={language}
          onValueChange={picked_language => {
            const next_language = TARGET_LANGUAGES.find(
              target_language => target_language === picked_language
            );

            if (next_language) set_language(next_language);
          }}
        >
          <SelectTrigger aria-label="Language" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {TARGET_LANGUAGES.map(target_language => (
              <SelectItem key={target_language} value={target_language}>
                {LANGUAGE_LABELS[target_language]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DialogHeader>
      {/* Keyed by language, so switching rebuilds the draft (Review Focus 4). */}
      <SpeechForm
        key={`${entity.entity_id}-${language}`}
        entity={entity}
        entities={entities}
        language={language}
        OnClose={OnClose}
        OnSaved={OnSaved}
      />
    </>
  );
}

export function SpeechDialog({
  target,
  entities,
  default_target_language,
  OnClose,
  OnCloseAutoFocus,
  OnSaved
}: SpeechDialogProps) {
  const entity = target
    ? entities.find(candidate => candidate.entity_id === target.entity_id)
    : undefined;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={is_open => {
        if (!is_open) OnClose();
      }}
    >
      <DialogContent onCloseAutoFocus={OnCloseAutoFocus}>
        {entity ? (
          <SpeechDialogBody
            key={entity.entity_id}
            entity={entity}
            entities={entities}
            default_target_language={default_target_language}
            OnClose={OnClose}
            OnSaved={OnSaved}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>
              {target ? `Speech — ${target.source_name}` : 'Speech'}
            </DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
