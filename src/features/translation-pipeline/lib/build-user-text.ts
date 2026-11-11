import type { MemoryContext, MemoryContextEntity } from '@/features/memory';
import type { ReadingDirection, TargetLanguage } from '@/features/settings';
import type {
  ChapterRecord,
  SpeechValue,
  TextRegion
} from '@/services/database';
import { TARGET_LANGUAGE_NAMES } from '../constants/prompts';

const DIRECTION_LINES: Record<ReadingDirection, string> = {
  rtl: 'Reading direction: right-to-left, top to bottom.',
  ltr: 'Reading direction: left-to-right, top to bottom.',
  auto: 'Reading direction: detect it from the layout (right-to-left for Japanese manga; top to bottom, then left to right, for webtoons and most Korean and Chinese comics).'
};

export function BuildImageReadingUserText(input: {
  reading_direction: ReadingDirection;
  tile_index: number;
  tile_count: number;
}): string {
  const direction_line = DIRECTION_LINES[input.reading_direction];

  if (input.tile_count <= 1) return direction_line;

  return [
    direction_line,
    `This image is part ${input.tile_index + 1} of ${input.tile_count} of one tall page, cut from top to bottom with a small overlap. Report only the regions visible in this part.`
  ].join('\n');
}

function ToPromptSpeechValue(
  value: SpeechValue | null
): { text: string; is_locked: boolean } | null {
  return value === null
    ? null
    : { text: value.text, is_locked: value.is_locked };
}

// The entity shape the model sees (spec 0004 §5.1): no entity_id, and the
// target language's wrong spellings as avoid_spellings.
function ToPromptEntity(entity: MemoryContextEntity) {
  return {
    kind: entity.kind,
    source_name: entity.source_name,
    source_aliases: entity.source_aliases,
    translation: entity.translation,
    avoid_spellings: entity.name_variants,
    is_locked: entity.is_locked,
    gender: entity.gender,
    notes_en: entity.notes_en,
    speech:
      entity.speech === null
        ? null
        : {
            self_pronoun: ToPromptSpeechValue(entity.speech.self_pronoun),
            sentence_ending: ToPromptSpeechValue(entity.speech.sentence_ending),
            address_terms: entity.speech.address_terms.map(address_term => ({
              listener: address_term.listener_source_name,
              term: address_term.term,
              is_locked: address_term.is_locked
            }))
          }
  };
}

export function BuildTranslationUserText(input: {
  regions: TextRegion[];
  context: MemoryContext;
  target_language: TargetLanguage;
}): string {
  return JSON.stringify({
    target_language: TARGET_LANGUAGE_NAMES[input.target_language],
    story: {
      synopsis_en: input.context.synopsis_en,
      previous_chapter_summaries: input.context.previous_chapter_summaries,
      current_chapter_notes: input.context.current_chapter_notes
    },
    entities: input.context.entities.map(ToPromptEntity),
    previous_lines: input.context.previous_lines,
    regions: input.regions.map(region => ({
      region_id: region.region_id,
      kind: region.kind,
      source_text: region.source_text
    }))
  });
}

export function BuildFinalizationUserText(input: {
  series_title: string;
  synopsis_en: string;
  previous_chapter: { chapter_number: string; summary_en: string } | null;
  chapter: ChapterRecord;
}): string {
  return JSON.stringify({
    series_title: input.series_title,
    synopsis_en: input.synopsis_en,
    previous_chapter: input.previous_chapter,
    chapter_number: input.chapter.chapter_number,
    page_notes: [...input.chapter.page_notes].sort(
      (left, right) => left.page_index - right.page_index
    )
  });
}
