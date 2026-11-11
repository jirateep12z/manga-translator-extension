import { AppError, IsAppError } from '@/lib/app-error';
import {
  IMAGE_ACCEPT_HEADER,
  IMAGE_FETCH_TIMEOUT_MS
} from '../constants/pipeline';
import { CreateKeyedSerialQueue } from '../lib/keyed-serial-queue';
import { AllocateRuleId, BuildRefererRule } from '../lib/network-rule-specs';
import { AddSessionRule, RemoveSessionRule } from './network-rules.service';

const IMAGE_FETCH_FAILED_MESSAGE = 'Unable to load this image.';
const IMAGE_FETCH_QUEUE_KEY = 'image-fetch';
const RunFetchSerialized = CreateKeyedSerialQueue();
const active_rule_ids = new Set<number>();

function IsAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function CreateFetchError(): AppError {
  return new AppError('IMAGE_FETCH_FAILED', IMAGE_FETCH_FAILED_MESSAGE);
}

function ReadImageHostname(image_url: string): string | null {
  try {
    return new URL(image_url).hostname;
  } catch {
    return null;
  }
}

export function FetchImageBytes(input: {
  image_url: string;
  page_url: string;
  is_referrer_hidden: boolean;
  signal: AbortSignal;
}): Promise<Blob> {
  if (ReadImageHostname(input.image_url) === null) {
    return Promise.reject(CreateFetchError());
  }

  // One queue for every host: `requestDomains` also matches subdomains, so
  // concurrent rules for example.com and img.example.com could conflict.
  return RunFetchSerialized(IMAGE_FETCH_QUEUE_KEY, async () => {
    if (input.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const rule_id = AllocateRuleId(active_rule_ids);
    const rule =
      rule_id === null
        ? null
        : BuildRefererRule({
            rule_id,
            image_url: input.image_url,
            page_url: input.page_url,
            extension_id: chrome.runtime.id,
            is_referrer_hidden: input.is_referrer_hidden
          });

    if (rule_id === null || rule === null) throw CreateFetchError();

    active_rule_ids.add(rule_id);

    try {
      await AddSessionRule(rule);

      // Fetches share one queue, so a host that never responds must not block
      // other tabs. A timeout rejects with TimeoutError, which maps to
      // IMAGE_FETCH_FAILED; a job cancel still rejects with AbortError.
      const response = await fetch(input.image_url, {
        headers: { Accept: IMAGE_ACCEPT_HEADER },
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)
        ])
      });

      if (!response.ok) throw CreateFetchError();

      return await response.blob();
    } catch (error) {
      if (IsAbortError(error) || IsAppError(error)) throw error;

      throw CreateFetchError();
    } finally {
      active_rule_ids.delete(rule_id);
      await RemoveSessionRule(rule_id).catch(error => {
        console.error('[background] remove-referer-rule', {
          outcome: 'failed',
          error
        });
      });
    }
  });
}
