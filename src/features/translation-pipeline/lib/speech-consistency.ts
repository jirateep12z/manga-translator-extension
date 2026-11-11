import {
  THAI_SELF_PRONOUNS,
  type MemoryContextEntity
} from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import type { SpeechProfile, TextRegion } from '@/services/database';
import { SPEECH_CORRECTION_HEADER } from '../constants/prompts';
import type { SpeechViolation, TranslatedRegion } from '../types/pipeline';
import { IsRegionNamingEntity, MatchNameUse } from './name-consistency';

// Spec 0004 §7.2.
const ALTERNATIVE_FORM_PATTERN =
  /ครับ\s*\/\s*ค่ะ|ค่ะ\s*\/\s*ครับ|ครับ\s*\/\s*คะ|คะ\s*\/\s*ครับ|\bhe\s*\/\s*she\b|\bshe\s*\/\s*he\b/giu;
const MASCULINE_ENDINGS: readonly string[] = ['ครับ', 'ครับผม'];
const FEMININE_ENDINGS: readonly string[] = ['ค่ะ', 'คะ'];
const THAI_SELF_PRONOUN_SET: ReadonlySet<string> = new Set(THAI_SELF_PRONOUNS);
const THAI_WORD_SEGMENTER = new Intl.Segmenter('th', { granularity: 'word' });

type SpeechCheckInput = {
  entities: readonly MemoryContextEntity[];
  regions: readonly TextRegion[];
  translations: readonly TranslatedRegion[];
  target_language: TargetLanguage;
};

type ProfiledSpeaker = MemoryContextEntity & { speech: SpeechProfile };

function SegmentWords(text: string): Set<string> {
  return new Set(
    Array.from(THAI_WORD_SEGMENTER.segment(text), segment => segment.segment)
  );
}

function ResolveSpeaker(
  entities: readonly MemoryContextEntity[],
  translation: TranslatedRegion
): ProfiledSpeaker | undefined {
  const speaker_source_name = translation.speaker_source_name ?? '';

  if (speaker_source_name === '') return undefined;

  const entity = MatchNameUse(
    entities.filter(candidate => candidate.kind === 'character'),
    { source_name: speaker_source_name, source_form: '', rendered: '' }
  );

  return entity?.speech ? (entity as ProfiledSpeaker) : undefined;
}

function FindAlternativeForms(
  translation: TranslatedRegion,
  speaker: string
): SpeechViolation[] {
  return Array.from(
    translation.text.matchAll(ALTERNATIVE_FORM_PATTERN),
    match => ({
      region_id: translation.region_id,
      kind: 'alternative_form' as const,
      speaker,
      expected: match[0],
      listener: ''
    })
  );
}

function FindThaiProfileViolations(
  speaker: ProfiledSpeaker,
  translation: TranslatedRegion
): SpeechViolation[] {
  const words = SegmentWords(translation.text);
  const violations: SpeechViolation[] = [];
  const self_pronoun = speaker.speech.self_pronoun?.text ?? '';
  const sentence_ending = speaker.speech.sentence_ending?.text ?? '';
  const base = {
    region_id: translation.region_id,
    speaker: speaker.source_name,
    listener: ''
  };
  const has_other_pronoun =
    self_pronoun !== '' &&
    [...words].some(
      word => THAI_SELF_PRONOUN_SET.has(word) && word !== self_pronoun
    );

  if (has_other_pronoun) {
    violations.push({ ...base, kind: 'self_pronoun', expected: self_pronoun });
  }

  const other_endings = MASCULINE_ENDINGS.includes(sentence_ending)
    ? FEMININE_ENDINGS
    : FEMININE_ENDINGS.includes(sentence_ending)
      ? MASCULINE_ENDINGS
      : [];

  if (other_endings.some(ending => words.has(ending))) {
    violations.push({
      ...base,
      kind: 'sentence_ending',
      expected: sentence_ending
    });
  }

  return violations;
}

function FindAddressViolations(
  entities: readonly MemoryContextEntity[],
  speaker: ProfiledSpeaker,
  region: TextRegion,
  translation: TranslatedRegion
): SpeechViolation[] {
  return speaker.speech.address_terms.flatMap(address_term => {
    const listener = MatchNameUse(entities, {
      source_name: address_term.listener_source_name,
      source_form: '',
      rendered: ''
    });
    const is_violation =
      listener !== undefined &&
      IsRegionNamingEntity(listener, region, translation) &&
      !translation.text.includes(address_term.term);

    return is_violation
      ? [
          {
            region_id: translation.region_id,
            kind: 'address_term' as const,
            speaker: speaker.source_name,
            expected: address_term.term,
            listener: address_term.listener_source_name
          }
        ]
      : [];
  });
}

export function FindSpeechViolations(
  input: SpeechCheckInput
): SpeechViolation[] {
  const region_by_id = new Map(
    input.regions.map(region => [region.region_id, region])
  );

  return input.translations.flatMap(translation => {
    const region = region_by_id.get(translation.region_id);
    const speaker = ResolveSpeaker(input.entities, translation);
    const alternative_forms = FindAlternativeForms(
      translation,
      translation.speaker_source_name ?? ''
    );

    if (region === undefined || speaker === undefined) {
      return alternative_forms;
    }

    return [
      ...alternative_forms,
      ...(input.target_language === 'th'
        ? FindThaiProfileViolations(speaker, translation)
        : []),
      ...FindAddressViolations(input.entities, speaker, region, translation)
    ];
  });
}

function FormatViolation(violation: SpeechViolation): string {
  const prefix = `- region ${violation.region_id}:`;

  switch (violation.kind) {
    case 'alternative_form':
      return `${prefix} choose one form instead of "${violation.expected}"`;
    case 'self_pronoun':
      return `${prefix} the speaker ${violation.speaker} uses the self pronoun "${violation.expected}"`;
    case 'sentence_ending':
      return `${prefix} the speaker ${violation.speaker} uses the ending "${violation.expected}"`;
    case 'address_term':
      return `${prefix} the speaker ${violation.speaker} calls ${violation.listener} "${violation.expected}"`;
  }
}

export function BuildSpeechCorrectionText(
  violations: readonly SpeechViolation[]
): string {
  return [SPEECH_CORRECTION_HEADER, ...violations.map(FormatViolation)].join(
    '\n'
  );
}
