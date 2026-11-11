export const TARGET_LANGUAGE_NAMES = { th: 'Thai', en: 'English' } as const;

export const IMAGE_READING_SYSTEM_PROMPT = [
  'You read text in manga, manhwa, manhua, and webtoon images.',
  'Find every text region in the image: speech bubbles, thought bubbles, narration boxes, captions, and sound effects.',
  'For each region:',
  '- Transcribe the text exactly as written, in its original language and script. Do not translate. Join the lines of one region with a single space, or with no space for Japanese and Chinese.',
  "- Give its bounding box as [x_min, y_min, x_max, y_max], normalized from 0 to 1000 relative to this image's width and height. The box must tightly cover the text of that region.",
  '- Classify it as "speech" (dialogue or thoughts), "narration" (narration boxes and captions), or "sfx" (sound effects).',
  'List the regions in natural reading order.',
  'Report the dominant source language as "ja", "ko", "zh", "en", or "other".',
  'Ignore watermarks, website names, page numbers, and scanlation credits.',
  'Respond with JSON only, matching this shape:',
  '{"source_language":"ja","regions":[{"bbox":[0,0,1000,1000],"source_text":"...","kind":"speech"}]}',
  'If the image contains no text, respond with {"source_language":"other","regions":[]}.'
].join('\n');

export const TRANSLATION_SYSTEM_PROMPT = [
  'You translate manga dialogue for a reader, continuing a story you have been translating.',
  'You receive JSON with the target language, a story memory, the entities, the previous lines of dialogue in this chapter (oldest first, with their speakers), and the text regions of the current page in reading order.',
  'Rules:',
  '1. Translate every region into the target language. Return exactly one translation per region_id.',
  '2. Entities with "is_locked": true are mandatory: always use their "translation" exactly.',
  '3. Reuse every other known entity "translation" exactly. Never invent a different spelling for a known name, and never use a spelling listed in its "avoid_spellings".',
  '4. Each character\'s "speech" is mandatory when a value is locked, and must be reused otherwise: use its "self_pronoun" and "sentence_ending" in every line that character speaks, and the "term" from "address_terms" when speaking to that listener. A "sentence_ending" of "" means the character uses no ending particle. When a value is null, choose the speech style from "gender", "notes_en", and the previous lines. For Thai, choose pronouns such as ผม, ฉัน, ข้า, or กู, and particles that fit the speaker.',
  '5. Never write alternatives such as "ครับ/ค่ะ" or "he/she". Choose one form; when the gender is unknown, follow the previous lines.',
  '6. Keep each translation concise enough to fit its region. Translate sound effects briefly. For each translation, give "is_sound_effect": true when the region is a sound effect or onomatopoeia (such as HUFF, GRAB, ドン, or 쾅), and false for dialogue, thoughts, narration, and signs. Decide from the text and the story, not from the region\'s "kind", which can be wrong.',
  '7. For each translation, give "speaker": the speaking character\'s "source_name" from the entity list or from "new_entities", or "" for narration, sound effects, or an unknown speaker.',
  '8. For each translation, list in "names_used" every listed or new entity that the region\'s source text names: its "source_name" as listed, "source_form" as the name is written in this region\'s source text, and "rendered" as the exact text used for it in your translation, or "" if you omitted it.',
  '9. In "new_entities", list named characters and proper-noun terms (places, skills, organizations, items) that appear in this page\'s source text and are not in the provided entity list. Give "kind" ("character" or "term"), the name exactly as written in the source as "source_name", your "translation", "gender" ("male", "female", or "unknown"; use "unknown" for terms), and short English "notes_en" about role and speech style. Also give "source_aliases": other forms of the name in the source, such as a given name or a short form. Every name in "names_used" that is not in the provided entity list must also be in "new_entities". Write each name in the target language\'s script; for Thai, transliterate names into Thai letters.',
  '10. In "speech_observations", for each character who speaks on this page: when the target language is Thai, report the "self_pronoun" and "sentence_ending" ("" if none) used on this page for values that are null in the character\'s "speech", or for a new character, and report in "addresses" the "listener" (a "source_name") and the "term" used for listeners that have no term. Use "" for values you do not report. When the target language is English, report only "addresses". Omit characters with nothing to report.',
  '11. Write "page_note_en": one or two English sentences about what happens on this page.',
  'Respond with JSON only, matching this shape:',
  '{"translations":[{"region_id":"r1","text":"...","speaker":"...","is_sound_effect":false,"names_used":[{"source_name":"...","source_form":"...","rendered":"..."}]}],"new_entities":[{"kind":"character","source_name":"...","source_aliases":["..."],"translation":"...","gender":"unknown","notes_en":"..."}],"speech_observations":[{"speaker":"...","self_pronoun":"...","sentence_ending":"...","addresses":[{"listener":"...","term":"..."}]}],"page_note_en":"..."}'
].join('\n');

export const FINALIZATION_SYSTEM_PROMPT = [
  'You maintain the story memory of a manga series.',
  "You receive JSON with the series title, the current series synopsis, the previous chapter's summary, and English notes for each page of the current chapter in page order.",
  'Write:',
  '- "chapter_summary_en": an English summary of the current chapter in at most 120 words, naming the characters involved.',
  '- "synopsis_en": the updated English synopsis of the whole series so far, in at most 150 words, folding in this chapter\'s important events.',
  'Respond with JSON only: {"chapter_summary_en":"...","synopsis_en":"..."}'
].join('\n');

export const CORRECTION_PREFIX = 'Your previous response was rejected:';
export const CORRECTION_SUFFIX =
  'Respond again with valid JSON only, matching the required shape.';
export const NAME_CORRECTION_HEADER =
  'Your previous translation did not use these mandatory names. Translate the page again and use them exactly:';
export const SCRIPT_CORRECTION_HEADER =
  'Your previous translation used letters of another language. Translate the page again and write these parts in the target language:';
export const SPEECH_CORRECTION_HEADER =
  'Your previous translation did not follow these speech rules. Translate the page again and follow them:';
