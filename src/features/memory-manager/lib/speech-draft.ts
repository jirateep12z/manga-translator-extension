import {
  MAX_ADDRESS_TERMS,
  TEXT_LIMITS,
  type EntityUserPatch,
  type SpeechProfilePatch,
  type SpeechValuePatch
} from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import { NormalizeText } from '@/lib/normalize-text';
import type { EntityRecord, SpeechProfile } from '@/services/database';

export type SpeechTermDraft = {
  row_id: string;
  listener_source_name: string;
  term: string;
  is_locked: boolean;
};

export type SpeechDraft = {
  self_pronoun_text: string;
  is_self_pronoun_locked: boolean;
  sentence_ending_text: string;
  is_sentence_ending_none: boolean;
  is_sentence_ending_locked: boolean;
  terms: SpeechTermDraft[];
  name_variants: string[];
};

export type SpeechDraftErrors = Partial<
  Record<'self_pronoun' | 'sentence_ending' | `term_${string}`, string>
>;

const DUPLICATE_LISTENER_MESSAGE = 'Choose each character once.';
const TOO_MANY_TERMS_MESSAGE = `Up to ${MAX_ADDRESS_TERMS} characters.`;

function CreateTooLongMessage(max_code_points: number): string {
  return `Use ${max_code_points} characters or fewer.`;
}

function IsLongerThan(text: string, max_code_points: number): boolean {
  return Array.from(text).length > max_code_points;
}

export function TermErrorKey(row_id: string): `term_${string}` {
  return `term_${row_id}`;
}

export function ToSpeechDraft(
  profile: SpeechProfile | undefined,
  name_variants: readonly string[]
): SpeechDraft {
  const sentence_ending = profile?.sentence_ending ?? null;

  return {
    self_pronoun_text: profile?.self_pronoun?.text ?? '',
    is_self_pronoun_locked: profile?.self_pronoun?.is_locked ?? false,
    sentence_ending_text: sentence_ending?.text ?? '',
    is_sentence_ending_none: sentence_ending?.text === '',
    is_sentence_ending_locked: sentence_ending?.is_locked ?? false,
    terms: (profile?.address_terms ?? []).map((address_term, index) => ({
      row_id: `term-${index}`,
      listener_source_name: address_term.listener_source_name,
      term: address_term.term,
      is_locked: address_term.is_locked
    })),
    name_variants: [...name_variants]
  };
}

function ReadTermError(
  term_draft: SpeechTermDraft,
  row_index: number,
  seen_listeners: Set<string>
): string | undefined {
  const normalized_listener = NormalizeText(term_draft.listener_source_name);

  if (row_index >= MAX_ADDRESS_TERMS) return TOO_MANY_TERMS_MESSAGE;
  if (normalized_listener !== '' && seen_listeners.has(normalized_listener)) {
    return DUPLICATE_LISTENER_MESSAGE;
  }

  seen_listeners.add(normalized_listener);

  return IsLongerThan(term_draft.term.trim(), TEXT_LIMITS.address_term)
    ? CreateTooLongMessage(TEXT_LIMITS.address_term)
    : undefined;
}

export function ValidateSpeechDraft(draft: SpeechDraft): SpeechDraftErrors {
  const errors: SpeechDraftErrors = {};
  const seen_listeners = new Set<string>();

  if (IsLongerThan(draft.self_pronoun_text.trim(), TEXT_LIMITS.speech_value)) {
    errors.self_pronoun = CreateTooLongMessage(TEXT_LIMITS.speech_value);
  }

  if (
    !draft.is_sentence_ending_none &&
    IsLongerThan(draft.sentence_ending_text.trim(), TEXT_LIMITS.speech_value)
  ) {
    errors.sentence_ending = CreateTooLongMessage(TEXT_LIMITS.speech_value);
  }

  draft.terms.forEach((term_draft, row_index) => {
    const term_error = ReadTermError(term_draft, row_index, seen_listeners);

    if (term_error) errors[TermErrorKey(term_draft.row_id)] = term_error;
  });

  return errors;
}

function ToValuePatch(text: string, is_locked: boolean): SpeechValuePatch {
  const trimmed_text = text.trim();

  return trimmed_text === '' ? null : { text: trimmed_text, is_locked };
}

// Spec 0004 §10: "none" stores '', and an empty field without it stores null.
export function ToSpeechPatch(draft: SpeechDraft): SpeechProfilePatch {
  return {
    self_pronoun: ToValuePatch(
      draft.self_pronoun_text,
      draft.is_self_pronoun_locked
    ),
    sentence_ending: draft.is_sentence_ending_none
      ? { text: '', is_locked: draft.is_sentence_ending_locked }
      : ToValuePatch(
          draft.sentence_ending_text,
          draft.is_sentence_ending_locked
        ),
    address_terms: draft.terms
      .map(term_draft => ({
        listener_source_name: term_draft.listener_source_name.trim(),
        term: term_draft.term.trim(),
        is_locked: term_draft.is_locked
      }))
      .filter(
        address_term =>
          address_term.listener_source_name !== '' && address_term.term !== ''
      )
  };
}

function IsEmptyProfilePatch(patch: SpeechProfilePatch): boolean {
  return (
    patch.self_pronoun === null &&
    patch.sentence_ending === null &&
    patch.address_terms.length === 0
  );
}

/**
 * The patch the dialog saves. An untouched language with no stored profile
 * sends no profile, and misspellings are sent only after a removal, so that
 * saving never creates empty data.
 */
export function BuildSpeechSavePatch(input: {
  language: TargetLanguage;
  initial_draft: SpeechDraft;
  draft: SpeechDraft;
  has_stored_profile: boolean;
}): EntityUserPatch {
  const speech_patch = ToSpeechPatch(input.draft);
  const has_speech =
    input.has_stored_profile || !IsEmptyProfilePatch(speech_patch);
  const has_removed_variants =
    input.draft.name_variants.length !==
    input.initial_draft.name_variants.length;

  return {
    ...(has_speech ? { speech: { [input.language]: speech_patch } } : {}),
    ...(has_removed_variants
      ? { name_variants: { [input.language]: input.draft.name_variants } }
      : {})
  };
}

/**
 * The series' other characters, plus any listener the draft already holds
 * that is not one of them as written (deleted, changed to a term, or stored
 * with another spelling), so the select shows it and its term stays
 * removable.
 */
export function ListListenerOptions(
  entities: readonly EntityRecord[],
  speaker_entity_id: string,
  draft: SpeechDraft
): string[] {
  const character_names = entities
    .filter(
      entity =>
        entity.kind === 'character' && entity.entity_id !== speaker_entity_id
    )
    .map(entity => entity.source_name);
  const known_listeners = new Set(character_names);
  const stored_listeners = draft.terms
    .map(term_draft => term_draft.listener_source_name)
    .filter(listener => {
      if (listener.trim() === '' || known_listeners.has(listener)) return false;

      known_listeners.add(listener);

      return true;
    });

  return [...character_names, ...stored_listeners].sort((left, right) =>
    left.localeCompare(right)
  );
}
