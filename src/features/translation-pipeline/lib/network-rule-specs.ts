import {
  OLLAMA_ORIGIN_RULE_ID,
  REFERER_RULE_ID_MAX,
  REFERER_RULE_ID_MIN
} from '../constants/pipeline';

export type SessionRuleSpec = {
  id: number;
  priority: 1;
  action: {
    type: 'modifyHeaders';
    requestHeaders: {
      header: string;
      operation: 'set' | 'remove';
      value?: string;
    }[];
  };
  condition: {
    initiatorDomains: string[];
    resourceTypes: ('xmlhttprequest' | 'other')[];
    urlFilter?: string;
    requestDomains?: string[];
  };
};

const EXTENSION_RESOURCE_TYPES: SessionRuleSpec['condition']['resourceTypes'] =
  ['xmlhttprequest', 'other'];

function ParseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function AllocateRuleId(
  active_rule_ids: ReadonlySet<number>
): number | null {
  for (
    let rule_id = REFERER_RULE_ID_MIN;
    rule_id <= REFERER_RULE_ID_MAX;
    rule_id++
  ) {
    if (!active_rule_ids.has(rule_id)) return rule_id;
  }

  return null;
}

export function BuildRefererRule(input: {
  rule_id: number;
  image_url: string;
  page_url: string;
  extension_id: string;
  is_referrer_hidden: boolean;
}): SessionRuleSpec | null {
  const image_url = ParseHttpUrl(input.image_url);

  if (!image_url) return null;

  // The page loads such an image without a Referer (referrerpolicy
  // "no-referrer"), and some image hosts reject a request that has one.
  const referer_header: SessionRuleSpec['action']['requestHeaders'][number] =
    input.is_referrer_hidden
      ? { header: 'referer', operation: 'remove' }
      : { header: 'referer', operation: 'set', value: input.page_url };

  return {
    id: input.rule_id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [referer_header]
    },
    condition: {
      requestDomains: [image_url.hostname],
      initiatorDomains: [input.extension_id],
      resourceTypes: EXTENSION_RESOURCE_TYPES
    }
  };
}

export function BuildOllamaOriginRule(
  ollama_base_url: string,
  extension_id: string
): SessionRuleSpec | null {
  const ollama_url = ParseHttpUrl(ollama_base_url);

  if (!ollama_url) return null;

  return {
    id: OLLAMA_ORIGIN_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'origin', operation: 'remove' }]
    },
    condition: {
      urlFilter: `|${ollama_url.origin}/`,
      initiatorDomains: [extension_id],
      resourceTypes: EXTENSION_RESOURCE_TYPES
    }
  };
}
