import { NormalizeText } from '@/lib/normalize-text';
import type {
  AddressTerm,
  EntityRecord,
  SpeechProfile,
  SpeechValue
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';
import {
  MAX_ADDRESS_TERMS,
  MAX_SOURCE_ALIASES,
  TEXT_LIMITS
} from '../constants/memory';
import type {
  AliasCandidate,
  LearnedNameVariant,
  ReportedEntity,
  SpeechObservation
} from '../types/memory';
import { AddNameVariant } from './name-variants';
import { IsRelatedNameForm } from './related-name-form';
import { TruncateText } from './truncate-text';

type MergeReportedEntitiesInput = {
  series_id: string;
  chapter_number: string;
  target_language: TargetLanguage;
  existing_entities: EntityRecord[];
  reported_entities: ReportedEntity[];
  page_source_text: string;
  now_iso: string;
  alias_candidates: AliasCandidate[];
  speech_observations: SpeechObservation[];
  learned_name_variants: LearnedNameVariant[];
};

const EMPTY_SPEECH_PROFILE: SpeechProfile = {
  self_pronoun: null,
  sentence_ending: null,
  address_terms: []
};

function MatchesName(entity: EntityRecord, normalized_name: string): boolean {
  return (
    entity.normalized_source_name === normalized_name ||
    entity.normalized_source_aliases.includes(normalized_name)
  );
}

function AppearsInText(entity: EntityRecord, normalized_text: string): boolean {
  return [entity.normalized_source_name, ...entity.normalized_source_aliases]
    .filter(name => name !== '')
    .some(name => normalized_text.includes(name));
}

function CreateEntity(
  input: MergeReportedEntitiesInput,
  reported: ReportedEntity & { normalized_source_name: string }
): EntityRecord {
  return {
    entity_id: crypto.randomUUID(),
    series_id: input.series_id,
    kind: reported.kind,
    kind_origin: 'ai',
    source_name: reported.source_name,
    normalized_source_name: reported.normalized_source_name,
    source_aliases: [],
    normalized_source_aliases: [],
    gender: reported.gender,
    notes_en: reported.notes_en,
    notes_origin: 'ai',
    translations:
      reported.translation === ''
        ? {}
        : {
            [input.target_language]: {
              text: reported.translation,
              origin: 'ai',
              is_locked: false
            }
          },
    speech: {},
    name_variants: {},
    first_seen_chapter: input.chapter_number,
    last_seen_at: input.now_iso,
    created_at: input.now_iso,
    updated_at: input.now_iso
  };
}

// Amendment U3: a name first seen without speaking is stored as a term, and
// becomes a character once the AI reports it as one or as a speaker. A kind
// the user set never changes.
function IsPromotableTerm(entity: EntityRecord): boolean {
  return entity.kind === 'term' && entity.kind_origin === 'ai';
}

function MergeIntoEntity(
  entity: EntityRecord,
  reported: ReportedEntity,
  target_language: TargetLanguage,
  now_iso: string
): EntityRecord {
  let has_content_change = false;
  let kind = entity.kind;
  let translations = entity.translations;
  let gender = entity.gender;
  let notes_en = entity.notes_en;
  let notes_origin = entity.notes_origin;

  if (reported.kind === 'character' && IsPromotableTerm(entity)) {
    kind = 'character';
    has_content_change = true;
  }

  if (!translations[target_language] && reported.translation !== '') {
    translations = {
      ...translations,
      [target_language]: {
        text: reported.translation,
        origin: 'ai',
        is_locked: false
      }
    };
    has_content_change = true;
  }

  if (gender === 'unknown' && reported.gender !== 'unknown') {
    gender = reported.gender;
    has_content_change = true;
  }

  const can_replace_notes = notes_origin === 'ai' || notes_en === '';

  if (
    can_replace_notes &&
    reported.notes_en !== '' &&
    reported.notes_en !== notes_en
  ) {
    notes_en = reported.notes_en;
    notes_origin = 'ai';
    has_content_change = true;
  }

  return {
    ...entity,
    kind,
    translations,
    gender,
    notes_en,
    notes_origin,
    last_seen_at: now_iso,
    updated_at: has_content_change ? now_iso : entity.updated_at
  };
}

// Spec 0004 §8.1 rules 1–3: an AI alias is stored only when it is a form of
// the entity's name (amendment U2), no entity of the series has that name
// yet, and only below the cap.
function AddAiAlias(
  entities: readonly EntityRecord[],
  entity: EntityRecord,
  alias: string,
  now_iso: string
): EntityRecord {
  const source_alias = TruncateText(alias, TEXT_LIMITS.source_name);
  const normalized_alias = NormalizeText(source_alias);
  const is_addable =
    normalized_alias !== '' &&
    IsRelatedNameForm(
      [entity.source_name, ...entity.source_aliases],
      source_alias
    ) &&
    entity.source_aliases.length < MAX_SOURCE_ALIASES &&
    !entities.some(other => MatchesName(other, normalized_alias));

  if (!is_addable) return entity;

  return {
    ...entity,
    source_aliases: [...entity.source_aliases, source_alias],
    normalized_source_aliases: [
      ...entity.normalized_source_aliases,
      normalized_alias
    ],
    updated_at: now_iso
  };
}

function CreateAiSpeechValue(text: string): SpeechValue {
  return { text, origin: 'ai', is_locked: false };
}

function ApplyAddress(
  entities: readonly EntityRecord[],
  profile: SpeechProfile,
  address: SpeechObservation['addresses'][number]
): SpeechProfile {
  const term = TruncateText(address.term, TEXT_LIMITS.address_term);
  const listener = entities.find(entity =>
    MatchesName(entity, NormalizeText(address.listener))
  );
  const is_addable =
    listener !== undefined &&
    term !== '' &&
    profile.address_terms.length < MAX_ADDRESS_TERMS &&
    !profile.address_terms.some(
      address_term =>
        NormalizeText(address_term.listener_source_name) ===
        listener.normalized_source_name
    );

  if (!is_addable) return profile;

  const address_term: AddressTerm = {
    listener_source_name: listener.source_name,
    term,
    origin: 'ai',
    is_locked: false
  };

  return {
    ...profile,
    address_terms: [...profile.address_terms, address_term]
  };
}

// Spec 0004 §8.1 rules 4, 5, and 7: AI fills only what is unknown.
function ApplyObservation(
  entities: readonly EntityRecord[],
  profile: SpeechProfile,
  observation: SpeechObservation,
  target_language: TargetLanguage
): SpeechProfile {
  const is_thai = target_language === 'th';
  const self_pronoun = TruncateText(
    observation.self_pronoun,
    TEXT_LIMITS.speech_value
  );
  const sentence_ending = TruncateText(
    observation.sentence_ending,
    TEXT_LIMITS.speech_value
  );
  const filled_profile: SpeechProfile = {
    ...profile,
    self_pronoun:
      profile.self_pronoun ??
      (is_thai && self_pronoun !== ''
        ? CreateAiSpeechValue(self_pronoun)
        : null),
    sentence_ending:
      profile.sentence_ending ??
      (is_thai ? CreateAiSpeechValue(sentence_ending) : null)
  };

  return observation.addresses.reduce(
    (current_profile, address) =>
      ApplyAddress(entities, current_profile, address),
    filled_profile
  );
}

function IsSameProfile(left: SpeechProfile, right: SpeechProfile): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function MergeReportedEntities(
  input: MergeReportedEntitiesInput
): EntityRecord[] {
  const existing_entities = input.existing_entities
    .filter(entity => entity.series_id === input.series_id)
    .map(entity => structuredClone(entity));
  const existing_ids = new Set(
    existing_entities.map(entity => entity.entity_id)
  );
  const working_entities = [...existing_entities];
  const touched_ids = new Set<string>();

  function ReplaceEntity(entity_index: number, entity: EntityRecord): void {
    if (entity !== working_entities[entity_index]) {
      touched_ids.add(entity.entity_id);
    }

    working_entities[entity_index] = entity;
  }

  const reported_aliases_by_index: {
    entity_index: number;
    aliases: string[];
  }[] = [];

  // Every reported entity is created or matched before any reported alias is
  // added, so two names reported on one page never merge (amendment U3).
  for (const raw_reported of input.reported_entities) {
    const source_name = TruncateText(
      raw_reported.source_name,
      TEXT_LIMITS.source_name
    );
    const normalized_source_name = NormalizeText(source_name);

    if (normalized_source_name === '') continue;

    const reported = {
      ...raw_reported,
      source_name,
      normalized_source_name,
      source_aliases: raw_reported.source_aliases.filter(alias =>
        IsRelatedNameForm([source_name], alias)
      ),
      translation: TruncateText(
        raw_reported.translation,
        TEXT_LIMITS.entity_translation
      ),
      notes_en: TruncateText(raw_reported.notes_en, TEXT_LIMITS.notes_en)
    };
    const name_match_index = working_entities.findIndex(entity =>
      MatchesName(entity, normalized_source_name)
    );
    // Rule 1: a new name whose alias is a stored name is that stored entity.
    const match_index =
      name_match_index !== -1
        ? name_match_index
        : working_entities.findIndex(
            entity =>
              existing_ids.has(entity.entity_id) &&
              reported.source_aliases.some(alias =>
                MatchesName(entity, NormalizeText(alias))
              )
          );
    let entity_index = match_index;

    if (match_index === -1) {
      working_entities.push(CreateEntity(input, reported));
      entity_index = working_entities.length - 1;
    } else {
      working_entities[match_index] = MergeIntoEntity(
        working_entities[match_index],
        reported,
        input.target_language,
        input.now_iso
      );
    }

    touched_ids.add(working_entities[entity_index].entity_id);
    reported_aliases_by_index.push({
      entity_index,
      aliases: reported.source_aliases
    });
  }

  for (const { entity_index, aliases } of reported_aliases_by_index) {
    for (const alias of aliases) {
      ReplaceEntity(
        entity_index,
        AddAiAlias(
          working_entities,
          working_entities[entity_index],
          alias,
          input.now_iso
        )
      );
    }
  }

  for (const alias_candidate of input.alias_candidates) {
    const entity_index = working_entities.findIndex(
      entity => entity.entity_id === alias_candidate.entity_id
    );

    if (entity_index === -1) continue;
    ReplaceEntity(
      entity_index,
      AddAiAlias(
        working_entities,
        working_entities[entity_index],
        alias_candidate.alias,
        input.now_iso
      )
    );
  }

  for (const observation of input.speech_observations) {
    const normalized_speaker = NormalizeText(observation.speaker);
    const entity_index = working_entities.findIndex(
      entity =>
        (entity.kind === 'character' || IsPromotableTerm(entity)) &&
        MatchesName(entity, normalized_speaker)
    );

    if (normalized_speaker === '' || entity_index === -1) continue;
    if (IsPromotableTerm(working_entities[entity_index])) {
      ReplaceEntity(entity_index, {
        ...working_entities[entity_index],
        kind: 'character',
        updated_at: input.now_iso
      });
    }

    const entity = working_entities[entity_index];
    const stored_profile =
      entity.speech[input.target_language] ?? EMPTY_SPEECH_PROFILE;
    const next_profile = ApplyObservation(
      working_entities,
      stored_profile,
      observation,
      input.target_language
    );

    if (IsSameProfile(stored_profile, next_profile)) continue;
    ReplaceEntity(entity_index, {
      ...entity,
      speech: { ...entity.speech, [input.target_language]: next_profile },
      updated_at: input.now_iso
    });
  }

  for (const learned_variant of input.learned_name_variants) {
    const entity_index = working_entities.findIndex(
      entity => entity.entity_id === learned_variant.entity_id
    );

    if (entity_index === -1) continue;

    const entity = working_entities[entity_index];
    const translation = entity.translations[input.target_language]?.text;
    const variants = entity.name_variants[input.target_language] ?? [];
    const next_variants =
      learned_variant.text === translation
        ? variants
        : AddNameVariant(variants, learned_variant.text);

    if (next_variants.length === variants.length) continue;
    ReplaceEntity(entity_index, {
      ...entity,
      name_variants: {
        ...entity.name_variants,
        [input.target_language]: next_variants
      },
      updated_at: input.now_iso
    });
  }

  const page_normalized_text = NormalizeText(input.page_source_text);

  for (const [entity_index, entity] of working_entities.entries()) {
    if (
      !existing_ids.has(entity.entity_id) ||
      touched_ids.has(entity.entity_id)
    ) {
      continue;
    }

    if (AppearsInText(entity, page_normalized_text)) {
      working_entities[entity_index] = {
        ...entity,
        last_seen_at: input.now_iso
      };
      touched_ids.add(entity.entity_id);
    }
  }

  const changed_existing = working_entities.filter(
    entity =>
      existing_ids.has(entity.entity_id) && touched_ids.has(entity.entity_id)
  );
  const created_entities = working_entities.filter(
    entity => !existing_ids.has(entity.entity_id)
  );

  return [...changed_existing, ...created_entities];
}
