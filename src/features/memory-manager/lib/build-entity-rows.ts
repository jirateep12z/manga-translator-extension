import type { TargetLanguage } from '@/features/settings';
import { NormalizeText } from '@/lib/normalize-text';
import type { EntityKind, EntityRecord, Gender } from '@/services/database';
import { TARGET_LANGUAGES } from '../constants/memory-manager';

export type EntityLanguageCell = {
  text: string;
  origin: 'ai' | 'user' | null;
  origin_label: 'AI-added' | 'User-edited' | 'Not translated';
  is_locked: boolean;
};

export type EntityRow = {
  entity_id: string;
  kind: EntityKind;
  kind_label: 'Character' | 'Term';
  source_name: string;
  aliases_text: string;
  gender: Gender;
  notes_en: string;
  cells: Record<TargetLanguage, EntityLanguageCell>;
};

export type EntityFilter = { query: string; kind: 'all' | EntityKind };

const KIND_ORDER: Record<EntityKind, number> = { character: 0, term: 1 };

function ToLanguageCell(
  translation: EntityRecord['translations'][TargetLanguage]
): EntityLanguageCell {
  if (!translation) {
    return {
      text: '',
      origin: null,
      origin_label: 'Not translated',
      is_locked: false
    };
  }

  return {
    text: translation.text,
    origin: translation.origin,
    origin_label: translation.origin === 'user' ? 'User-edited' : 'AI-added',
    is_locked: translation.is_locked
  };
}

function MatchesQuery(entity: EntityRecord, normalized_query: string): boolean {
  if (normalized_query === '') return true;

  return (
    entity.normalized_source_name.includes(normalized_query) ||
    entity.normalized_source_aliases.some(alias =>
      alias.includes(normalized_query)
    ) ||
    Object.values(entity.translations).some(
      translation =>
        translation !== undefined &&
        NormalizeText(translation.text).includes(normalized_query)
    )
  );
}

function ToEntityRow(entity: EntityRecord): EntityRow {
  return {
    entity_id: entity.entity_id,
    kind: entity.kind,
    kind_label: entity.kind === 'character' ? 'Character' : 'Term',
    source_name: entity.source_name,
    aliases_text: entity.source_aliases.join(', '),
    gender: entity.gender,
    notes_en: entity.notes_en,
    cells: Object.fromEntries(
      TARGET_LANGUAGES.map(language => [
        language,
        ToLanguageCell(entity.translations[language])
      ])
    ) as Record<TargetLanguage, EntityLanguageCell>
  };
}

export function BuildEntityRows(
  entities: EntityRecord[],
  filter: EntityFilter
): EntityRow[] {
  const normalized_query = NormalizeText(filter.query);

  return entities
    .filter(
      entity =>
        (filter.kind === 'all' || entity.kind === filter.kind) &&
        MatchesQuery(entity, normalized_query)
    )
    .sort(
      (left, right) =>
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
        left.source_name.localeCompare(right.source_name, 'en')
    )
    .map(ToEntityRow);
}
