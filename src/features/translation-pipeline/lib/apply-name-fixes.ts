import {
  IsRelatedNameForm,
  IsReplaceableNameText,
  type LearnedNameVariant,
  type MemoryContextEntity
} from '@/features/memory';
import type { TextRegion } from '@/services/database';
import type { TranslatedRegion } from '../types/pipeline';
import { IsRegionNamingEntity, MatchNameUse } from './name-consistency';

type NameFixInput = {
  entities: readonly MemoryContextEntity[];
  regions: readonly TextRegion[];
  translations: readonly TranslatedRegion[];
};

type TranslatedEntity = MemoryContextEntity & { translation: string };

function ListTranslatedEntities(
  entities: readonly MemoryContextEntity[]
): TranslatedEntity[] {
  return entities.filter(
    (entity): entity is TranslatedEntity => entity.translation !== null
  );
}

function ListOtherTranslations(
  entities: readonly TranslatedEntity[],
  entity: TranslatedEntity
): string[] {
  return entities
    .filter(other => other.entity_id !== entity.entity_id)
    .map(other => other.translation);
}

// The non-empty renderings the model reports for this entity in a region,
// through a form of the entity's name (amendment U2). A report without a
// source form is not enough: the region may name another person whose name
// contains this one (amendment U3, rule K).
function ListReportedRenderings(
  entity: TranslatedEntity,
  translation: TranslatedRegion
): string[] {
  const entity_names = [entity.source_name, ...entity.source_aliases];

  return translation.names_used
    .filter(
      name_use =>
        name_use.rendered !== '' &&
        MatchNameUse([entity], name_use) === entity &&
        IsRelatedNameForm(entity_names, name_use.source_form)
    )
    .map(name_use => name_use.rendered);
}

function FixRegion(
  entities: readonly TranslatedEntity[],
  region: TextRegion | undefined,
  translation: TranslatedRegion
): { translation: TranslatedRegion; fix_count: number } {
  let text = translation.text;
  let fix_count = 0;

  for (const entity of entities) {
    const is_fixable =
      region !== undefined &&
      !text.includes(entity.translation) &&
      IsRegionNamingEntity(entity, region, translation);

    if (!is_fixable) continue;

    const wrong_spelling = ListReportedRenderings(entity, translation).find(
      rendered =>
        text.includes(rendered) &&
        IsReplaceableNameText({
          text: rendered,
          translation: entity.translation,
          other_translations: ListOtherTranslations(entities, entity)
        })
    );

    if (wrong_spelling === undefined) continue;

    text = text.split(wrong_spelling).join(entity.translation);
    fix_count++;
  }

  return { translation: { ...translation, text }, fix_count };
}

// Spec 0004 §6.3: replaces only the wrong spelling the model reports using.
export function ApplyNameFixes(input: NameFixInput): {
  translations: TranslatedRegion[];
  fix_count: number;
} {
  const entities = ListTranslatedEntities(input.entities);
  const region_by_id = new Map(
    input.regions.map(region => [region.region_id, region])
  );
  const fixed_regions = input.translations.map(translation =>
    FixRegion(entities, region_by_id.get(translation.region_id), translation)
  );

  return {
    translations: fixed_regions.map(fixed_region => fixed_region.translation),
    fix_count: fixed_regions.reduce(
      (total, fixed_region) => total + fixed_region.fix_count,
      0
    )
  };
}

// Spec 0004 §6.4: reported renderings that are wrong spellings of a name.
export function CollectWrongSpellings(
  input: NameFixInput
): LearnedNameVariant[] {
  const entities = ListTranslatedEntities(input.entities);
  const seen_keys = new Set<string>();
  const wrong_spellings: LearnedNameVariant[] = [];

  for (const translation of input.translations) {
    for (const entity of entities) {
      for (const rendered of ListReportedRenderings(entity, translation)) {
        const key = `${entity.entity_id}\n${rendered}`;
        const is_wrong_spelling =
          rendered !== entity.translation &&
          IsReplaceableNameText({
            text: rendered,
            translation: entity.translation,
            other_translations: ListOtherTranslations(entities, entity)
          }) &&
          !seen_keys.has(key);

        if (!is_wrong_spelling) continue;
        seen_keys.add(key);
        wrong_spellings.push({ entity_id: entity.entity_id, text: rendered });
      }
    }
  }

  return wrong_spellings;
}
