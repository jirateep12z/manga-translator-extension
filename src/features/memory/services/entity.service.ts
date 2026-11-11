import { NormalizeText } from '@/lib/normalize-text';
import {
  OpenDatabase,
  type AddressTerm,
  type EntityKind,
  type EntityRecord,
  type SpeechProfile,
  type SpeechValue
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';
import { MAX_ADDRESS_TERMS, TEXT_LIMITS } from '../constants/memory';
import { UpdateVariantsForNewTranslation } from '../lib/name-variants';
import { NormalizeEntityRecord } from '../lib/normalize-entity-record';
import { TruncateText } from '../lib/truncate-text';
import type {
  EntityUserPatch,
  SpeechProfilePatch,
  SpeechValuePatch
} from '../types/memory';

const ENTITY_NOT_FOUND_MESSAGE = 'Entity not found.';

function PatchEntries<T>(
  patch: Partial<Record<TargetLanguage, T>>
): [TargetLanguage, T][] {
  return Object.entries(patch) as [TargetLanguage, T][];
}

function ApplySpeechValuePatch(
  stored_value: SpeechValue | null,
  value_patch: SpeechValuePatch,
  is_empty_text_unknown: boolean
): SpeechValue | null {
  if (value_patch === null) return null;

  const text = TruncateText(value_patch.text, TEXT_LIMITS.speech_value);

  if (text === '' && is_empty_text_unknown) return null;

  const is_unchanged =
    stored_value !== null &&
    stored_value.text === text &&
    stored_value.is_locked === value_patch.is_locked;

  return is_unchanged
    ? stored_value
    : { text, origin: 'user', is_locked: value_patch.is_locked };
}

function ApplyAddressTermsPatch(
  stored_terms: readonly AddressTerm[],
  terms_patch: SpeechProfilePatch['address_terms']
): AddressTerm[] {
  const seen_listeners = new Set<string>();
  const address_terms: AddressTerm[] = [];

  for (const term_patch of terms_patch) {
    const listener_source_name = TruncateText(
      term_patch.listener_source_name,
      TEXT_LIMITS.source_name
    );
    const normalized_listener = NormalizeText(listener_source_name);
    const term = TruncateText(term_patch.term, TEXT_LIMITS.address_term);

    if (
      normalized_listener === '' ||
      term === '' ||
      seen_listeners.has(normalized_listener)
    ) {
      continue;
    }

    if (address_terms.length >= MAX_ADDRESS_TERMS) break;
    seen_listeners.add(normalized_listener);

    const stored_term = stored_terms.find(
      candidate =>
        NormalizeText(candidate.listener_source_name) === normalized_listener
    );
    const is_unchanged =
      stored_term !== undefined &&
      stored_term.term === term &&
      stored_term.is_locked === term_patch.is_locked;

    address_terms.push(
      is_unchanged
        ? stored_term
        : {
            listener_source_name,
            term,
            origin: 'user',
            is_locked: term_patch.is_locked
          }
    );
  }

  return address_terms;
}

function ApplySpeechPatch(
  speech: EntityRecord['speech'],
  patch: NonNullable<EntityUserPatch['speech']>
): EntityRecord['speech'] {
  const next_speech: EntityRecord['speech'] = { ...speech };

  for (const [target_language, profile_patch] of PatchEntries(patch)) {
    const stored_profile: SpeechProfile | undefined = speech[target_language];

    next_speech[target_language] = {
      self_pronoun: ApplySpeechValuePatch(
        stored_profile?.self_pronoun ?? null,
        profile_patch.self_pronoun,
        true
      ),
      sentence_ending: ApplySpeechValuePatch(
        stored_profile?.sentence_ending ?? null,
        profile_patch.sentence_ending,
        false
      ),
      address_terms: ApplyAddressTermsPatch(
        stored_profile?.address_terms ?? [],
        profile_patch.address_terms
      )
    };
  }

  return next_speech;
}

// The user can only remove wrong spellings; additions are ignored.
function ApplyNameVariantsPatch(
  name_variants: EntityRecord['name_variants'],
  patch: NonNullable<EntityUserPatch['name_variants']>
): EntityRecord['name_variants'] {
  const next_name_variants: EntityRecord['name_variants'] = {
    ...name_variants
  };

  for (const [target_language, kept_variants] of PatchEntries(patch)) {
    next_name_variants[target_language] = (
      name_variants[target_language] ?? []
    ).filter(variant => kept_variants.includes(variant));
  }

  return next_name_variants;
}

// Spec 0004 §8.4. Wrong spellings belong to a current translation, so
// removing the translation removes them (plan 0016 Task 15).
function UpdateVariantsForTranslationEdits(input: {
  name_variants: EntityRecord['name_variants'];
  old_translations: EntityRecord['translations'];
  new_translations: EntityRecord['translations'];
  edited_languages: readonly TargetLanguage[];
  other_entities: readonly EntityRecord[];
}): EntityRecord['name_variants'] {
  const next_name_variants: EntityRecord['name_variants'] = {
    ...input.name_variants
  };

  for (const target_language of input.edited_languages) {
    const old_text = input.old_translations[target_language]?.text ?? '';
    const new_text = input.new_translations[target_language]?.text ?? '';

    if (new_text === '') {
      delete next_name_variants[target_language];
      continue;
    }

    if (new_text === old_text) continue;

    const variants = UpdateVariantsForNewTranslation({
      variants: input.name_variants[target_language] ?? [],
      old_text,
      new_text,
      other_translations: input.other_entities.flatMap(
        other => other.translations[target_language]?.text ?? []
      )
    });

    // A language without wrong spellings keeps no empty list.
    if (variants.length > 0 || input.name_variants[target_language]) {
      next_name_variants[target_language] = variants;
    }
  }

  return next_name_variants;
}

function ApplyTranslationPatch(
  translations: EntityRecord['translations'],
  patch: NonNullable<EntityUserPatch['translations']>
): EntityRecord['translations'] {
  const next_translations: EntityRecord['translations'] = { ...translations };

  for (const [target_language, translation_patch] of Object.entries(patch) as [
    TargetLanguage,
    { text: string; is_locked: boolean }
  ][]) {
    const text = TruncateText(
      translation_patch.text,
      TEXT_LIMITS.entity_translation
    );
    const stored_translation = translations[target_language];

    if (text === '') {
      delete next_translations[target_language];
      continue;
    }

    next_translations[target_language] = {
      text,
      is_locked: translation_patch.is_locked,
      origin:
        stored_translation && stored_translation.text === text
          ? stored_translation.origin
          : 'user'
    };
  }

  return next_translations;
}

function CleanSourceAliases(
  source_aliases: string[],
  normalized_source_name: string
): string[] {
  const seen_aliases = new Set([normalized_source_name]);

  return source_aliases
    .map(source_alias => TruncateText(source_alias, TEXT_LIMITS.source_name))
    .filter(source_alias => {
      const normalized_alias = NormalizeText(source_alias);

      if (source_alias === '' || seen_aliases.has(normalized_alias)) {
        return false;
      }

      seen_aliases.add(normalized_alias);

      return true;
    });
}

function ApplyUserPatch(
  entity: EntityRecord,
  patch: EntityUserPatch,
  other_entities: readonly EntityRecord[]
): EntityRecord {
  const notes_en =
    patch.notes_en === undefined
      ? entity.notes_en
      : TruncateText(patch.notes_en, TEXT_LIMITS.notes_en);
  const source_aliases =
    patch.source_aliases === undefined
      ? entity.source_aliases
      : CleanSourceAliases(patch.source_aliases, entity.normalized_source_name);
  const translations = patch.translations
    ? ApplyTranslationPatch(entity.translations, patch.translations)
    : entity.translations;
  const kept_name_variants = patch.name_variants
    ? ApplyNameVariantsPatch(entity.name_variants, patch.name_variants)
    : entity.name_variants;

  return {
    ...entity,
    translations,
    speech: patch.speech
      ? ApplySpeechPatch(entity.speech, patch.speech)
      : entity.speech,
    name_variants: UpdateVariantsForTranslationEdits({
      name_variants: kept_name_variants,
      old_translations: entity.translations,
      new_translations: translations,
      edited_languages: patch.translations
        ? PatchEntries(patch.translations).map(
            ([target_language]) => target_language
          )
        : [],
      other_entities
    }),
    notes_en,
    notes_origin: notes_en === entity.notes_en ? entity.notes_origin : 'user',
    gender: patch.gender ?? entity.gender,
    kind: patch.kind ?? entity.kind,
    kind_origin:
      patch.kind === undefined || patch.kind === entity.kind
        ? entity.kind_origin
        : 'user',
    source_aliases,
    normalized_source_aliases: source_aliases.map(NormalizeText),
    updated_at: new Date().toISOString()
  };
}

export async function ListEntities(series_id: string): Promise<EntityRecord[]> {
  const database = await OpenDatabase();

  const entities = await database.getAllFromIndex(
    'entities',
    'by_series',
    series_id
  );

  return entities.map(NormalizeEntityRecord);
}

export async function CreateUserEntity(input: {
  series_id: string;
  kind: EntityKind;
  source_name: string;
}): Promise<EntityRecord> {
  const source_name = TruncateText(input.source_name, TEXT_LIMITS.source_name);

  if (source_name === '') throw new Error('source_name is required.');

  const normalized_source_name = NormalizeText(source_name);
  const database = await OpenDatabase();
  const transaction = database.transaction('entities', 'readwrite');
  const duplicate_key = await transaction.store
    .index('by_series_name')
    .getKey([input.series_id, normalized_source_name]);

  if (duplicate_key !== undefined) {
    transaction.abort();
    await transaction.done.catch(() => {});

    throw new Error('An entity with this source name already exists.');
  }

  const now_iso = new Date().toISOString();
  const entity: EntityRecord = {
    entity_id: crypto.randomUUID(),
    series_id: input.series_id,
    kind: input.kind,
    kind_origin: 'user',
    source_name,
    normalized_source_name,
    source_aliases: [],
    normalized_source_aliases: [],
    gender: 'unknown',
    notes_en: '',
    notes_origin: 'user',
    translations: {},
    speech: {},
    name_variants: {},
    first_seen_chapter: '',
    last_seen_at: now_iso,
    created_at: now_iso,
    updated_at: now_iso
  };

  await transaction.store.put(entity);
  await transaction.done;

  return entity;
}

export async function UpdateEntityByUser(
  entity_id: string,
  patch: EntityUserPatch
): Promise<EntityRecord> {
  const database = await OpenDatabase();
  const transaction = database.transaction('entities', 'readwrite');
  const entity = await transaction.store.get(entity_id);

  if (!entity) {
    transaction.abort();
    await transaction.done.catch(() => {});

    throw new Error(ENTITY_NOT_FOUND_MESSAGE);
  }

  // Spec 0004 §8.4 condition 4 needs the other translations of the series.
  const other_entities = patch.translations
    ? (await transaction.store.index('by_series').getAll(entity.series_id))
        .filter(other => other.entity_id !== entity_id)
        .map(NormalizeEntityRecord)
    : [];
  const updated_entity = ApplyUserPatch(
    NormalizeEntityRecord(entity),
    patch,
    other_entities
  );

  await transaction.store.put(updated_entity);
  await transaction.done;

  return updated_entity;
}

export async function DeleteEntity(entity_id: string): Promise<void> {
  const database = await OpenDatabase();

  await database.delete('entities', entity_id);
}
