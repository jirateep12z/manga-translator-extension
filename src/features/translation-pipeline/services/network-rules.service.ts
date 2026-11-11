import {
  CHROME_STORAGE_AREA,
  CHROME_STORAGE_KEY,
  MergeSettings,
  ReadSettings
} from '@/features/settings';
import { IsRecord } from '@/lib/is-record';
import {
  OLLAMA_ORIGIN_RULE_ID,
  REFERER_RULE_ID_MAX,
  REFERER_RULE_ID_MIN
} from '../constants/pipeline';
import {
  BuildOllamaOriginRule,
  type SessionRuleSpec
} from '../lib/network-rule-specs';

// @types/chrome models action and resource types as string enums.
function ToChromeRule(
  spec: SessionRuleSpec
): chrome.declarativeNetRequest.Rule {
  return spec as unknown as chrome.declarativeNetRequest.Rule;
}

function BuildOllamaRules(
  ollama_base_url: string
): chrome.declarativeNetRequest.Rule[] {
  const rule = BuildOllamaOriginRule(ollama_base_url, chrome.runtime.id);

  return rule ? [ToChromeRule(rule)] : [];
}

export async function AddSessionRule(rule: SessionRuleSpec): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [ToChromeRule(rule)]
  });
}

export async function RemoveSessionRule(rule_id: number): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [rule_id]
  });
}

export async function InstallNetworkRules(): Promise<void> {
  const session_rules = await chrome.declarativeNetRequest.getSessionRules();
  const stale_referer_rule_ids = session_rules
    .map(rule => rule.id)
    .filter(
      rule_id =>
        rule_id >= REFERER_RULE_ID_MIN && rule_id <= REFERER_RULE_ID_MAX
    );
  const settings = await ReadSettings();

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [...stale_referer_rule_ids, OLLAMA_ORIGIN_RULE_ID],
    addRules: BuildOllamaRules(settings.ollama_base_url)
  });
}

export async function UpdateOllamaOriginRule(
  ollama_base_url: string
): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [OLLAMA_ORIGIN_RULE_ID],
    addRules: BuildOllamaRules(ollama_base_url)
  });
}

function ReadOllamaBaseUrl(value: unknown): string {
  return MergeSettings(IsRecord(value) ? value : {}).ollama_base_url;
}

export async function HandleNetworkSettingsChange(
  changes: Record<string, chrome.storage.StorageChange>,
  area_name: string
): Promise<void> {
  const settings_change = changes[CHROME_STORAGE_KEY];

  if (area_name !== CHROME_STORAGE_AREA || !settings_change) return;

  const previous_url = ReadOllamaBaseUrl(settings_change.oldValue);
  const next_url = ReadOllamaBaseUrl(settings_change.newValue);

  if (previous_url !== next_url) await UpdateOllamaOriginRule(next_url);
}
