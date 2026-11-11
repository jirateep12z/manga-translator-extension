import type { ProviderName } from '@/services/ai-provider';
import type { Settings } from '../types/settings';
import { ResolveProviderStages } from './stage-provider';

const CONNECTION_ORDER: readonly ProviderName[] = ['openrouter', 'ollama'];

// The connections the Settings page shows: only the providers that the
// active stages call (plan 0026).
export function ResolveVisibleConnections(settings: Settings): ProviderName[] {
  const used_providers = new Set(
    ResolveProviderStages(settings).map(stage => stage.provider)
  );

  return CONNECTION_ORDER.filter(provider => used_providers.has(provider));
}
