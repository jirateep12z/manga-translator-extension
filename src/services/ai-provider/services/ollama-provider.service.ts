import { AppError } from '@/lib/app-error';
import { IsRecord } from '@/lib/is-record';
import { OLLAMA_CONTEXT_TOKENS } from '../constants/provider';
import { AccumulateOllamaStream } from '../lib/accumulate-stream';
import {
  MapOllamaStatus,
  ToProviderFetchError
} from '../lib/map-provider-error';
import { ReadTextLines } from '../lib/read-text-lines';
import type {
  AiProvider,
  CompletionRequest,
  ModelInfo,
  ProviderConnection
} from '../types/provider';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const TRAILING_SLASHES_PATTERN = /\/+$/;

function ToBaseUrl(ollama_base_url: string): string {
  return ollama_base_url.replace(TRAILING_SLASHES_PATTERN, '');
}

async function FetchOllama(url: string, init: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw ToProviderFetchError(error, 'ollama');
  }

  if (!response.ok) throw MapOllamaStatus(response.status, '');

  return response;
}

function CreateChatBody(request: CompletionRequest) {
  const user_message =
    request.images_base64_jpeg.length > 0
      ? {
          role: 'user',
          content: request.user_text,
          images: request.images_base64_jpeg
        }
      : { role: 'user', content: request.user_text };

  return {
    model: request.model,
    stream: true,
    // Thinking models such as Qwen3.5 think by default, which is far slower.
    // Models that cannot turn thinking off use their own default.
    think: false,
    format: request.json_schema,
    options: {
      temperature: request.temperature,
      num_ctx: OLLAMA_CONTEXT_TOKENS
    },
    messages: [{ role: 'system', content: request.system_prompt }, user_message]
  };
}

async function ReadVisionCapability(
  base_url: string,
  model_name: string,
  signal: AbortSignal
): Promise<boolean | null> {
  try {
    const response = await FetchOllama(`${base_url}/api/show`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ model: model_name }),
      signal
    });
    const payload: unknown = await response.json();

    return IsRecord(payload) && Array.isArray(payload.capabilities)
      ? payload.capabilities.includes('vision')
      : null;
  } catch (error) {
    if (signal.aborted) throw error;

    return null;
  }
}

export function CreateOllamaProvider(
  connection: ProviderConnection
): AiProvider {
  const base_url = ToBaseUrl(connection.ollama_base_url);

  return {
    async CreateCompletion(request, signal) {
      if (request.model === '') {
        throw new AppError('NOT_CONFIGURED', 'Set up a provider in Settings.');
      }

      const response = await FetchOllama(`${base_url}/api/chat`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(CreateChatBody(request)),
        signal
      });

      if (!response.body) {
        throw new AppError(
          'PROVIDER_UNAVAILABLE',
          "The provider isn't responding."
        );
      }

      return AccumulateOllamaStream(ReadTextLines(response.body));
    },
    async ListModels(signal) {
      const response = await FetchOllama(`${base_url}/api/tags`, {
        method: 'GET',
        signal
      });
      const payload: unknown = await response.json();
      const model_names = (
        IsRecord(payload) && Array.isArray(payload.models) ? payload.models : []
      )
        .map(model => (IsRecord(model) ? model.name : undefined))
        .filter((name): name is string => typeof name === 'string');
      const models: ModelInfo[] = await Promise.all(
        model_names.map(async model_name => ({
          model_id: model_name,
          label: model_name,
          is_vision_capable: await ReadVisionCapability(
            base_url,
            model_name,
            signal
          ),
          reasoning: null
        }))
      );

      return models.sort((left, right) =>
        left.label.localeCompare(right.label)
      );
    },
    async TestConnection(signal) {
      const response = await FetchOllama(`${base_url}/api/tags`, {
        method: 'GET',
        signal
      });

      await response.text();
    }
  };
}

export async function WarmUpOllamaModel(
  ollama_base_url: string,
  model: string,
  signal: AbortSignal
): Promise<void> {
  const response = await FetchOllama(`${ToBaseUrl(ollama_base_url)}/api/chat`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      model,
      messages: [],
      options: { num_ctx: OLLAMA_CONTEXT_TOKENS }
    }),
    signal
  });

  await response.text();
}
