import type { PublicSettings, Settings } from '../types/settings';
import { IsProviderConfigured } from './stage-provider';

export function CreatePublicSettings(settings: Settings): PublicSettings {
  return {
    theme: settings.theme,
    is_enabled: settings.is_enabled,
    target_language: settings.target_language,
    reading_direction: settings.reading_direction,
    is_provider_configured: IsProviderConfigured(settings)
  };
}
