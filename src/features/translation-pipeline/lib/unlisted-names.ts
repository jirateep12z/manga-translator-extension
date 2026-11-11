import {
  IsRelatedNameForm,
  type MemoryContextEntity,
  type ReportedEntity
} from '@/features/memory';
import { NormalizeText } from '@/lib/normalize-text';
import type { TextRegion } from '@/services/database';
import type { NameUse, TranslatedRegion } from '../types/pipeline';

type UnlistedNameInput = {
  entities: readonly MemoryContextEntity[];
  reported_entities: readonly ReportedEntity[];
  regions: readonly TextRegion[];
  translations: readonly TranslatedRegion[];
};

function ListKnownNames(input: UnlistedNameInput): string[] {
  return [
    ...input.entities.flatMap(entity => [
      entity.source_name,
      ...entity.source_aliases
    ]),
    ...input.reported_entities.flatMap(entity => [
      entity.source_name,
      ...entity.source_aliases
    ])
  ].filter(name => NormalizeText(name) !== '');
}

function ListSpeakers(translations: readonly TranslatedRegion[]): Set<string> {
  return new Set(
    translations.map(translation =>
      NormalizeText(translation.speaker_source_name ?? '')
    )
  );
}

// The name as the region's source text writes it: the reported form, or the
// name itself when the model gave no form.
function ReadWrittenForm(name_use: NameUse): string {
  return name_use.source_form === ''
    ? name_use.source_name
    : name_use.source_form;
}

function ToReportedEntity(
  name_use: NameUse,
  speakers: ReadonlySet<string>
): ReportedEntity {
  const normalized_name = NormalizeText(name_use.source_name);
  const is_alias =
    name_use.source_form !== '' &&
    NormalizeText(name_use.source_form) !== normalized_name &&
    IsRelatedNameForm([name_use.source_name], name_use.source_form);

  return {
    kind: speakers.has(normalized_name) ? 'character' : 'term',
    source_name: name_use.source_name,
    source_aliases: is_alias ? [name_use.source_form] : [],
    translation: name_use.rendered,
    gender: 'unknown',
    notes_en: ''
  };
}

/**
 * Amendment U2 rule B: a name the model uses in "names_used" that is neither
 * listed nor reported in "new_entities" becomes a new entity, when the
 * region's source text has it. A name that also speaks on the page is a
 * character; any other name is a term.
 */
export function CollectUnlistedNameEntities(
  input: UnlistedNameInput
): ReportedEntity[] {
  const known_names = ListKnownNames(input);
  const speakers = ListSpeakers(input.translations);
  const region_by_id = new Map(
    input.regions.map(region => [region.region_id, region])
  );
  const unlisted_entities: ReportedEntity[] = [];

  for (const translation of input.translations) {
    const region = region_by_id.get(translation.region_id);

    if (region === undefined) continue;

    const normalized_source_text = NormalizeText(region.source_text);

    for (const name_use of translation.names_used) {
      const written_form = ReadWrittenForm(name_use);
      const normalized_form = NormalizeText(written_form);
      // A form of a known name is that entity, so it is never a new one.
      const is_unlisted =
        NormalizeText(name_use.source_name) !== '' &&
        normalized_form !== '' &&
        normalized_source_text.includes(normalized_form) &&
        !IsRelatedNameForm(known_names, name_use.source_name) &&
        !IsRelatedNameForm(known_names, written_form);

      if (!is_unlisted) continue;
      known_names.push(name_use.source_name);
      unlisted_entities.push(ToReportedEntity(name_use, speakers));
    }
  }

  return unlisted_entities;
}
