import { NormalizeText } from '@/lib/normalize-text';
import type {
  ChapterRecord,
  EntityRecord,
  SeriesRecord
} from '@/services/database';
import type { TargetLanguage } from '@/types/target-language';
import {
  MAX_CONTEXT_CHAPTER_SUMMARIES,
  MAX_CONTEXT_ENTITIES
} from '../constants/memory';
import type {
  DialoguePage,
  MemoryContext,
  MemoryContextEntity,
  PreviousChapterSummary
} from '../types/memory';
import { SelectDialogueWindow } from './select-dialogue-window';

const LOCKED_GROUP = 0;
const ON_PAGE_GROUP = 1;
const OTHER_GROUP = 2;

type BuildMemoryContextInput = {
  series: SeriesRecord;
  entities: EntityRecord[];
  target_language: TargetLanguage;
  page_source_text: string;
  previous_chapter_summaries: PreviousChapterSummary[];
  current_chapter: ChapterRecord | undefined;
  dialogue_pages: DialoguePage[];
};

function RankEntity(
  entity: EntityRecord,
  target_language: TargetLanguage,
  page_normalized_text: string
): number {
  if (entity.translations[target_language]?.is_locked) return LOCKED_GROUP;

  const is_on_page = [
    entity.normalized_source_name,
    ...entity.normalized_source_aliases
  ]
    .filter(name => name !== '')
    .some(name => page_normalized_text.includes(name));

  return is_on_page ? ON_PAGE_GROUP : OTHER_GROUP;
}

function ToContextEntity(
  entity: EntityRecord,
  target_language: TargetLanguage
): MemoryContextEntity {
  const translation = entity.translations[target_language];
  const speech = entity.speech[target_language];

  return {
    entity_id: entity.entity_id,
    kind: entity.kind,
    source_name: entity.source_name,
    source_aliases: entity.source_aliases,
    translation: translation?.text ?? null,
    is_locked: translation?.is_locked ?? false,
    gender: entity.gender,
    notes_en: entity.notes_en,
    name_variants: entity.name_variants[target_language] ?? [],
    speech: entity.kind === 'character' && speech ? speech : null
  };
}

// Address terms are sent only for listeners the model also sees (spec 0004
// §5.1).
function KeepContextListeners(
  entities: MemoryContextEntity[]
): MemoryContextEntity[] {
  const context_names = new Set(
    entities.map(entity => NormalizeText(entity.source_name))
  );

  return entities.map(entity =>
    entity.speech === null
      ? entity
      : {
          ...entity,
          speech: {
            ...entity.speech,
            address_terms: entity.speech.address_terms.filter(address_term =>
              context_names.has(
                NormalizeText(address_term.listener_source_name)
              )
            )
          }
        }
  );
}

export function BuildMemoryContext(
  input: BuildMemoryContextInput
): MemoryContext {
  const page_normalized_text = NormalizeText(input.page_source_text);
  const ranked_entities = input.entities
    .filter(entity => entity.series_id === input.series.series_id)
    .map(entity => ({
      entity,
      group: RankEntity(entity, input.target_language, page_normalized_text)
    }))
    .sort(
      (left, right) =>
        left.group - right.group ||
        right.entity.last_seen_at.localeCompare(left.entity.last_seen_at) ||
        left.entity.normalized_source_name.localeCompare(
          right.entity.normalized_source_name
        )
    );

  return {
    entities: KeepContextListeners(
      ranked_entities
        .slice(0, MAX_CONTEXT_ENTITIES)
        .map(({ entity }) => ToContextEntity(entity, input.target_language))
    ),
    synopsis_en: input.series.synopsis_en,
    previous_chapter_summaries: input.previous_chapter_summaries.slice(
      -MAX_CONTEXT_CHAPTER_SUMMARIES
    ),
    current_chapter_notes: input.current_chapter?.page_notes ?? [],
    previous_lines: SelectDialogueWindow(input.dialogue_pages)
  };
}
