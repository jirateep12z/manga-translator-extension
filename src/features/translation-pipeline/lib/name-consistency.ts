import {
  IsRelatedNameForm,
  type AliasCandidate,
  type MemoryContext,
  type MemoryContextEntity
} from '@/features/memory';
import { NormalizeText } from '@/lib/normalize-text';
import type { TextRegion } from '@/services/database';
import { NAME_CORRECTION_HEADER } from '../constants/prompts';
import type {
  NameUse,
  NameViolation,
  TranslatedRegion
} from '../types/pipeline';

const MIN_ALIAS_CODE_POINTS = 2;

type NameConsistencyInput = {
  entities: MemoryContext['entities'];
  regions: readonly TextRegion[];
  translations: readonly TranslatedRegion[];
};

function ListEntityNames(entity: MemoryContextEntity): string[] {
  return [entity.source_name, ...entity.source_aliases].filter(
    name => name !== ''
  );
}

function ListNormalizedNames(entity: MemoryContextEntity): string[] {
  return ListEntityNames(entity).map(NormalizeText);
}

// A names_used entry belongs to the entity it names by source name or alias.
export function MatchNameUse(
  entities: readonly MemoryContextEntity[],
  name_use: NameUse
): MemoryContextEntity | undefined {
  const normalized_name = NormalizeText(name_use.source_name);

  return entities.find(entity =>
    ListNormalizedNames(entity).includes(normalized_name)
  );
}

function FindNameInSource(
  entity: MemoryContextEntity,
  region: TextRegion
): string | undefined {
  const source_text = region.source_text.toLocaleLowerCase();

  return ListEntityNames(entity).find(name =>
    source_text.includes(name.toLocaleLowerCase())
  );
}

function FindReportedSourceForm(
  entity: MemoryContextEntity,
  region: TextRegion,
  translation: TranslatedRegion | undefined
): string | undefined {
  const normalized_source_text = NormalizeText(region.source_text);

  return translation?.names_used.find(
    name_use =>
      MatchNameUse([entity], name_use) === entity &&
      IsRelatedNameForm(ListEntityNames(entity), name_use.source_form) &&
      normalized_source_text.includes(NormalizeText(name_use.source_form))
  )?.source_form;
}

// Spec 0004 §6.1: the source text has the entity's name, or the model reports
// a form of the name that the source text has.
export function IsRegionNamingEntity(
  entity: MemoryContextEntity,
  region: TextRegion,
  translation: TranslatedRegion | undefined
): boolean {
  return (
    FindNameInSource(entity, region) !== undefined ||
    FindReportedSourceForm(entity, region, translation) !== undefined
  );
}

export function FindNameConsistencyViolations(
  input: NameConsistencyInput
): NameViolation[] {
  const translation_by_region = new Map(
    input.translations.map(translation => [translation.region_id, translation])
  );
  const translated_entities = input.entities.flatMap(entity =>
    entity.translation === null
      ? []
      : [{ entity, translation: entity.translation }]
  );
  const violations: NameViolation[] = [];

  for (const region of input.regions) {
    const region_translation = translation_by_region.get(region.region_id);

    if (region_translation === undefined) continue;

    const translated_text = region_translation.text.toLocaleLowerCase();

    for (const { entity, translation } of translated_entities) {
      const matched_name =
        FindNameInSource(entity, region) ??
        FindReportedSourceForm(entity, region, region_translation);
      const is_violation =
        matched_name !== undefined &&
        !translated_text.includes(translation.toLocaleLowerCase());

      if (is_violation) {
        violations.push({
          region_id: region.region_id,
          matched_name,
          expected_translation: translation
        });
      }
    }
  }

  return violations;
}

function IsNewAliasForm(
  entities: readonly MemoryContextEntity[],
  normalized_form: string
): boolean {
  return (
    Array.from(normalized_form).length >= MIN_ALIAS_CODE_POINTS &&
    !entities.some(entity =>
      ListNormalizedNames(entity).includes(normalized_form)
    )
  );
}

// Spec 0004 §6.1: a reported form of a name that no entity has yet.
export function CollectAliasCandidates(
  input: NameConsistencyInput
): AliasCandidate[] {
  const region_by_id = new Map(
    input.regions.map(region => [region.region_id, region])
  );
  const seen_keys = new Set<string>();
  const alias_candidates: AliasCandidate[] = [];

  for (const translation of input.translations) {
    const region = region_by_id.get(translation.region_id);

    if (region === undefined) continue;

    const normalized_source_text = NormalizeText(region.source_text);

    for (const name_use of translation.names_used) {
      const entity = MatchNameUse(input.entities, name_use);
      const normalized_form = NormalizeText(name_use.source_form);
      const candidate_key = `${entity?.entity_id ?? ''}\n${normalized_form}`;
      const is_candidate =
        entity !== undefined &&
        IsRelatedNameForm(ListEntityNames(entity), name_use.source_form) &&
        normalized_source_text.includes(normalized_form) &&
        IsNewAliasForm(input.entities, normalized_form) &&
        !seen_keys.has(candidate_key);

      if (!is_candidate) continue;
      seen_keys.add(candidate_key);
      alias_candidates.push({
        entity_id: entity.entity_id,
        alias: name_use.source_form
      });
    }
  }

  return alias_candidates;
}

export function BuildNameCorrectionText(violations: NameViolation[]): string {
  return [
    NAME_CORRECTION_HEADER,
    ...violations.map(
      violation =>
        `- region ${violation.region_id}: "${violation.matched_name}" must be translated as "${violation.expected_translation}"`
    )
  ].join('\n');
}
