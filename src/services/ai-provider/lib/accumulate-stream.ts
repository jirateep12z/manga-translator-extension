import { AppError } from '@/lib/app-error';
import { IsRecord } from '@/lib/is-record';
import type { CompletionResult } from '../types/provider';
import {
  MapOllamaStreamError,
  MapOpenRouterStatus
} from './map-provider-error';

const SSE_DATA_PREFIX = 'data:';
const SSE_COMMENT_PREFIX = ':';
const SSE_DONE_MARKER = '[DONE]';

function ParseStreamJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The provider sent an unreadable stream.'
    );
  }
}

function ReadOpenRouterDelta(payload: Record<string, unknown>): string | null {
  const choices = payload.choices;

  if (!Array.isArray(choices) || !IsRecord(choices[0])) return null;

  const delta = choices[0].delta;

  return IsRecord(delta) && typeof delta.content === 'string'
    ? delta.content
    : null;
}

export async function AccumulateOpenRouterStream(
  lines: AsyncIterable<string>
): Promise<CompletionResult> {
  let text = '';
  let model = '';

  for await (const line of lines) {
    if (line === '' || line.startsWith(SSE_COMMENT_PREFIX)) continue;
    if (!line.startsWith(SSE_DATA_PREFIX)) continue;

    const data = line.slice(SSE_DATA_PREFIX.length).trim();

    if (data === SSE_DONE_MARKER) break;

    const payload = ParseStreamJson(data);

    if (!IsRecord(payload)) continue;
    if (IsRecord(payload.error)) {
      throw MapOpenRouterStatus(
        Number(payload.error.code),
        String(payload.error.message ?? ''),
        null
      );
    }

    const delta_text = ReadOpenRouterDelta(payload);

    if (delta_text !== null) text += delta_text;
    if (typeof payload.model === 'string') model = payload.model;
  }

  return { text, model };
}

export async function AccumulateOllamaStream(
  lines: AsyncIterable<string>
): Promise<CompletionResult> {
  let text = '';
  let model = '';

  for await (const line of lines) {
    if (line.trim() === '') continue;

    const payload = ParseStreamJson(line);

    if (!IsRecord(payload)) continue;
    if (typeof payload.error === 'string') {
      throw MapOllamaStreamError(payload.error);
    }

    if (
      IsRecord(payload.message) &&
      typeof payload.message.content === 'string'
    ) {
      text += payload.message.content;
    }

    if (typeof payload.model === 'string') model = payload.model;
    if (payload.done === true) break;
  }

  return { text, model };
}
