import type {
  AliasCandidate,
  LearnedNameVariant,
  MemoryContext,
  ReportedEntity
} from '@/features/memory';
import type { TargetLanguage } from '@/features/settings';
import { ToErrorCode } from '@/lib/app-error';
import type {
  AiProvider,
  CompletionRequest,
  ReasoningEffortLevel
} from '@/services/ai-provider';
import type { TextRegion } from '@/services/database';
import { TRANSLATION_TEMPERATURE } from '../constants/pipeline';
import { TRANSLATION_SYSTEM_PROMPT } from '../constants/prompts';
import { TRANSLATION_JSON_SCHEMA } from '../constants/response-schemas';
import { ApplyNameFixes, CollectWrongSpellings } from '../lib/apply-name-fixes';
import { BuildTranslationUserText } from '../lib/build-user-text';
import {
  BuildScriptCorrectionText,
  FindForeignScriptViolations,
  KeepTargetScriptEntities
} from '../lib/foreign-script';
import {
  BuildNameCorrectionText,
  CollectAliasCandidates,
  FindNameConsistencyViolations
} from '../lib/name-consistency';
import {
  BuildSpeechCorrectionText,
  FindSpeechViolations
} from '../lib/speech-consistency';
import { CollectUnlistedNameEntities } from '../lib/unlisted-names';
import { ClearUntranslatedNames } from '../lib/untranslated-names';
import { ValidateTranslationResponse } from '../lib/validate-translation';
import type {
  ForeignScriptViolation,
  NameViolation,
  SpeechViolation,
  TranslationResponse
} from '../types/pipeline';
import { RunJsonStage } from './run-json-stage.service';

const STAGE_TWO_CONTEXT_LOG_EVENT = '[background] stage2-context';

type TranslatePageTextInput = {
  provider: AiProvider;
  model: string;
  reasoning_effort: ReasoningEffortLevel | null;
  regions: TextRegion[];
  context: MemoryContext;
  target_language: TargetLanguage;
  signal: AbortSignal;
};

type TranslatePageTextResult = {
  response: TranslationResponse;
  model: string;
  has_name_warnings: boolean;
  has_script_warnings: boolean;
  has_speech_warnings: boolean;
  learned_name_variants: LearnedNameVariant[];
  alias_candidates: AliasCandidate[];
};

type StageResult = { value: TranslationResponse; model: string };

type TranslationIssues = {
  name_violations: NameViolation[];
  script_violations: ForeignScriptViolation[];
  speech_violations: SpeechViolation[];
};

type CheckedResult = { stage_result: StageResult; issues: TranslationIssues };

function CheckResult(
  input: TranslatePageTextInput,
  stage_result: StageResult
): CheckedResult {
  const check_input = {
    entities: input.context.entities,
    regions: input.regions,
    translations: stage_result.value.translations
  };

  return {
    stage_result,
    issues: {
      name_violations: FindNameConsistencyViolations(check_input),
      script_violations: FindForeignScriptViolations(
        stage_result.value.translations,
        input.target_language
      ),
      speech_violations: FindSpeechViolations({
        ...check_input,
        target_language: input.target_language
      })
    }
  };
}

function HasIssues(issues: TranslationIssues): boolean {
  return (
    issues.name_violations.length > 0 ||
    issues.script_violations.length > 0 ||
    issues.speech_violations.length > 0
  );
}

/** One correction for every kind of issue, so a page is retried at most once. */
function BuildCorrectionTexts(
  issues: TranslationIssues,
  target_language: TargetLanguage
): string[] {
  return [
    ...(issues.name_violations.length > 0
      ? [BuildNameCorrectionText(issues.name_violations)]
      : []),
    ...(issues.script_violations.length > 0
      ? [BuildScriptCorrectionText(issues.script_violations, target_language)]
      : []),
    ...(issues.speech_violations.length > 0
      ? [BuildSpeechCorrectionText(issues.speech_violations)]
      : [])
  ];
}

/**
 * Asks again once with a correction for every issue. Returns the retry's
 * result, or null when the retry fails and the job was not canceled.
 */
async function RetryWithCorrections(
  input: TranslatePageTextInput,
  request: CompletionRequest,
  RunStage: (stage_request: CompletionRequest) => Promise<StageResult>,
  first: CheckedResult
): Promise<StageResult | null> {
  try {
    return await RunStage({
      ...request,
      user_text: [
        request.user_text,
        ...BuildCorrectionTexts(first.issues, input.target_language)
      ].join('\n\n')
    });
  } catch (error) {
    if (ToErrorCode(error) === 'CANCELED') throw error;

    return null;
  }
}

/** Logs counts, never text, for the issues the returned result still has. */
function LogRemainingIssues(
  issues: TranslationIssues,
  region_count: number
): void {
  if (issues.name_violations.length > 0) {
    console.warn('[background] name-consistency-warning', {
      region_count,
      violation_count: issues.name_violations.length
    });
  }

  if (issues.script_violations.length > 0) {
    console.warn('[background] foreign-script-warning', {
      region_count,
      violation_count: issues.script_violations.length
    });
  }

  if (issues.speech_violations.length > 0) {
    console.warn('[background] speech-consistency-warning', {
      region_count,
      violation_count: issues.speech_violations.length
    });
  }
}

function LogDroppedEntities(dropped_entity_count: number): void {
  if (dropped_entity_count === 0) return;

  console.warn('[background] foreign-script-entity-dropped', {
    dropped_entity_count
  });
}

// Spec 0004 §6.4: wrong spellings from every attempt, without duplicates.
function CollectAttemptWrongSpellings(
  input: TranslatePageTextInput,
  attempts: readonly StageResult[]
): LearnedNameVariant[] {
  const seen_keys = new Set<string>();

  return attempts
    .flatMap(attempt =>
      CollectWrongSpellings({
        entities: input.context.entities,
        regions: input.regions,
        translations: attempt.value.translations
      })
    )
    .filter(wrong_spelling => {
      const key = `${wrong_spelling.entity_id}\n${wrong_spelling.text}`;

      if (seen_keys.has(key)) return false;
      seen_keys.add(key);

      return true;
    });
}

// Spec 0004 §6.2 steps 3 and 4: fix names in the chosen result, then check
// again.
function FixNames(
  input: TranslatePageTextInput,
  chosen: StageResult
): { checked: CheckedResult; fix_count: number } {
  const { translations, fix_count } = ApplyNameFixes({
    entities: input.context.entities,
    regions: input.regions,
    translations: chosen.value.translations
  });

  return {
    checked: CheckResult(input, {
      ...chosen,
      value: { ...chosen.value, translations }
    }),
    fix_count
  };
}

export async function TranslatePageText(
  input: TranslatePageTextInput
): Promise<TranslatePageTextResult> {
  const region_ids = input.regions.map(region => region.region_id);
  const request: CompletionRequest = {
    model: input.model,
    system_prompt: TRANSLATION_SYSTEM_PROMPT,
    user_text: BuildTranslationUserText(input),
    images_base64_jpeg: [],
    json_schema: TRANSLATION_JSON_SCHEMA,
    temperature: TRANSLATION_TEMPERATURE,
    reasoning_effort: input.reasoning_effort
  };
  const RunStage = (stage_request: CompletionRequest) =>
    RunJsonStage({
      provider: input.provider,
      request: stage_request,
      Validate: raw => ValidateTranslationResponse(raw, region_ids),
      signal: input.signal
    });
  const first_result = await RunStage(request);
  const first = CheckResult(input, first_result);
  const retry_result = HasIssues(first.issues)
    ? await RetryWithCorrections(input, request, RunStage, first)
    : null;
  const { checked, fix_count } = FixNames(input, retry_result ?? first_result);
  const { stage_result, issues } = checked;
  const learned_name_variants = CollectAttemptWrongSpellings(
    input,
    retry_result ? [first_result, retry_result] : [first_result]
  );
  const alias_candidates = CollectAliasCandidates({
    entities: input.context.entities,
    regions: input.regions,
    translations: stage_result.value.translations
  });
  const has_name_warnings = issues.name_violations.length > 0;
  const has_script_warnings = issues.script_violations.length > 0;
  const has_speech_warnings = issues.speech_violations.length > 0;

  LogRemainingIssues(issues, input.regions.length);
  console.info(STAGE_TWO_CONTEXT_LOG_EVENT, {
    entity_count: input.context.entities.length,
    profile_count: input.context.entities.filter(
      entity => entity.speech !== null
    ).length,
    dialogue_line_count: input.context.previous_lines.length,
    user_text_chars: Array.from(request.user_text).length,
    name_fix_count: fix_count,
    learned_variant_count: learned_name_variants.length,
    alias_candidate_count: alias_candidates.length,
    speech_violation_count: issues.speech_violations.length,
    outcome:
      has_name_warnings || has_script_warnings || has_speech_warnings
        ? 'translated_with_warnings'
        : 'translated'
  });

  // Amendment U2 rule B: names the model used without reporting them.
  const reported_entities: ReportedEntity[] = [
    ...stage_result.value.new_entities,
    ...CollectUnlistedNameEntities({
      entities: input.context.entities,
      reported_entities: stage_result.value.new_entities,
      regions: input.regions,
      translations: stage_result.value.translations
    })
  ];
  // A saved name with a stray letter, or left untranslated, would force it
  // into every later page. Rule A runs first, so a translation with no Thai
  // letter at all keeps its entity without a translation (amendment U3).
  const new_entities = KeepTargetScriptEntities(
    ClearUntranslatedNames(reported_entities, input.target_language),
    input.target_language
  );

  LogDroppedEntities(reported_entities.length - new_entities.length);

  return {
    response: { ...stage_result.value, new_entities },
    model: stage_result.model,
    has_name_warnings,
    has_script_warnings,
    has_speech_warnings,
    learned_name_variants,
    alias_candidates
  };
}
