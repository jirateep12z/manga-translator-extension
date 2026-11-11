import { AppError } from '@/lib/app-error';
import { IsRecord } from '@/lib/is-record';
import {
  OPENROUTER_BASE_URL,
  REASONING_EFFORT_LEVELS
} from '../constants/provider';
import { AccumulateOpenRouterStream } from '../lib/accumulate-stream';
import {
  MapOpenRouterStatus,
  ToProviderFetchError
} from '../lib/map-provider-error';
import { ReadTextLines } from '../lib/read-text-lines';
import type {
  AiProvider,
  CompletionRequest,
  ModelInfo,
  ModelReasoning,
  ProviderConnection,
  ReasoningEffortLevel
} from '../types/provider';

const RESPONSE_SCHEMA_NAME = 'response';

function CreateNotConfiguredError(): AppError {
  return new AppError('NOT_CONFIGURED', 'Set up a provider in Settings.');
}

function CreateHeaders(api_key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${api_key}`,
    'Content-Type': 'application/json'
  };
}

function CreateCompletionBody(request: CompletionRequest) {
  const image_parts = request.images_base64_jpeg.map(image_base64 => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${image_base64}` }
  }));

  return {
    model: request.model,
    stream: true,
    temperature: request.temperature,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: RESPONSE_SCHEMA_NAME,
        strict: true,
        schema: request.json_schema
      }
    },
    ...(request.reasoning_effort === null
      ? {}
      : { reasoning: { effort: request.reasoning_effort } }),
    messages: [
      { role: 'system', content: request.system_prompt },
      {
        role: 'user',
        content: [{ type: 'text', text: request.user_text }, ...image_parts]
      }
    ]
  };
}

async function FetchOpenRouter(
  url: string,
  init: RequestInit
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw ToProviderFetchError(error, 'openrouter');
  }

  if (!response.ok) {
    throw MapOpenRouterStatus(
      response.status,
      await ReadErrorMessage(response),
      response.headers.get('Retry-After')
    );
  }

  return response;
}

async function ReadErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = JSON.parse(await response.text());

    return IsRecord(payload) &&
      IsRecord(payload.error) &&
      typeof payload.error.message === 'string'
      ? payload.error.message
      : '';
  } catch {
    return '';
  }
}

function IsReasoningEffortLevel(value: unknown): value is ReasoningEffortLevel {
  return (
    typeof value === 'string' &&
    (REASONING_EFFORT_LEVELS as readonly string[]).includes(value)
  );
}

// Unknown or malformed values are dropped, so a metadata change at
// OpenRouter hides the Thinking field instead of breaking the model list.
function ToModelReasoning(reasoning: unknown): ModelReasoning | null {
  // IsRecord also accepts arrays, which are not a reasoning object.
  if (!IsRecord(reasoning) || Array.isArray(reasoning)) return null;

  const listed_efforts: unknown[] = Array.isArray(reasoning.supported_efforts)
    ? reasoning.supported_efforts
    : [];

  return {
    supported_efforts: REASONING_EFFORT_LEVELS.filter(
      level => level !== 'none' && listed_efforts.includes(level)
    ),
    is_mandatory: reasoning.mandatory === true,
    default_effort: IsReasoningEffortLevel(reasoning.default_effort)
      ? reasoning.default_effort
      : null
  };
}

function ToModelInfo(model: unknown): ModelInfo | null {
  if (!IsRecord(model) || typeof model.id !== 'string') return null;

  const input_modalities = IsRecord(model.architecture)
    ? model.architecture.input_modalities
    : undefined;

  return {
    model_id: model.id,
    label: typeof model.name === 'string' ? model.name : model.id,
    is_vision_capable: Array.isArray(input_modalities)
      ? input_modalities.includes('image')
      : null,
    reasoning: ToModelReasoning(model.reasoning)
  };
}

export function CreateOpenRouterProvider(
  connection: ProviderConnection
): AiProvider {
  const api_key = connection.openrouter_api_key;

  return {
    async CreateCompletion(request, signal) {
      if (api_key === '' || request.model === '') {
        throw CreateNotConfiguredError();
      }

      const response = await FetchOpenRouter(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: CreateHeaders(api_key),
          body: JSON.stringify(CreateCompletionBody(request)),
          signal
        }
      );

      if (!response.body) {
        throw new AppError(
          'PROVIDER_UNAVAILABLE',
          "The provider isn't responding."
        );
      }

      return AccumulateOpenRouterStream(ReadTextLines(response.body));
    },
    async ListModels(signal) {
      const headers: Record<string, string> =
        api_key === '' ? {} : { Authorization: `Bearer ${api_key}` };
      const response = await FetchOpenRouter(`${OPENROUTER_BASE_URL}/models`, {
        method: 'GET',
        headers,
        signal
      });
      const payload: unknown = await response.json();
      const models =
        IsRecord(payload) && Array.isArray(payload.data) ? payload.data : [];

      return models
        .map(ToModelInfo)
        .filter((model): model is ModelInfo => model !== null)
        .sort((left, right) => left.label.localeCompare(right.label));
    },
    async TestConnection(signal) {
      if (api_key === '') throw CreateNotConfiguredError();

      const response = await FetchOpenRouter(`${OPENROUTER_BASE_URL}/key`, {
        method: 'GET',
        headers: CreateHeaders(api_key),
        signal
      });

      await response.text();
    }
  };
}
