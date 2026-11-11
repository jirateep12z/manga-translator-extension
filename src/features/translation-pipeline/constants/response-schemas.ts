export const IMAGE_READING_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    source_language: {
      type: 'string',
      enum: ['ja', 'ko', 'zh', 'en', 'other']
    },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bbox: {
            type: 'array',
            items: { type: 'number' },
            minItems: 4,
            maxItems: 4
          },
          source_text: { type: 'string' },
          kind: { type: 'string', enum: ['speech', 'narration', 'sfx'] }
        },
        required: ['bbox', 'source_text', 'kind'],
        additionalProperties: false
      }
    }
  },
  required: ['source_language', 'regions'],
  additionalProperties: false
};

const NAME_USE_SCHEMA = {
  type: 'object',
  properties: {
    source_name: { type: 'string' },
    source_form: { type: 'string' },
    rendered: { type: 'string' }
  },
  required: ['source_name', 'source_form', 'rendered'],
  additionalProperties: false
};

const ADDRESS_SCHEMA = {
  type: 'object',
  properties: { listener: { type: 'string' }, term: { type: 'string' } },
  required: ['listener', 'term'],
  additionalProperties: false
};

export const TRANSLATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          region_id: { type: 'string' },
          text: { type: 'string' },
          speaker: { type: 'string' },
          is_sound_effect: { type: 'boolean' },
          names_used: { type: 'array', items: NAME_USE_SCHEMA }
        },
        required: [
          'region_id',
          'text',
          'speaker',
          'is_sound_effect',
          'names_used'
        ],
        additionalProperties: false
      }
    },
    new_entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['character', 'term'] },
          source_name: { type: 'string' },
          source_aliases: { type: 'array', items: { type: 'string' } },
          translation: { type: 'string' },
          gender: { type: 'string', enum: ['male', 'female', 'unknown'] },
          notes_en: { type: 'string' }
        },
        required: [
          'kind',
          'source_name',
          'source_aliases',
          'translation',
          'gender',
          'notes_en'
        ],
        additionalProperties: false
      }
    },
    speech_observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          self_pronoun: { type: 'string' },
          sentence_ending: { type: 'string' },
          addresses: { type: 'array', items: ADDRESS_SCHEMA }
        },
        required: ['speaker', 'self_pronoun', 'sentence_ending', 'addresses'],
        additionalProperties: false
      }
    },
    page_note_en: { type: 'string' }
  },
  required: [
    'translations',
    'new_entities',
    'speech_observations',
    'page_note_en'
  ],
  additionalProperties: false
};

export const FINALIZATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    chapter_summary_en: { type: 'string' },
    synopsis_en: { type: 'string' }
  },
  required: ['chapter_summary_en', 'synopsis_en'],
  additionalProperties: false
};
