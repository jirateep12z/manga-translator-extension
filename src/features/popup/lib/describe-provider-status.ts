import {
  IsProviderConfigured,
  ResolveStageProvider,
  type Settings
} from '@/features/settings';
import type { ProviderName } from '@/services/ai-provider';

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  openrouter: 'OpenRouter',
  ollama: 'Ollama'
};

const OCR_READER_LABEL = 'On-device OCR';

export type ProviderStatus = {
  provider_label: string;
  is_ready: boolean;
  status_label: 'Ready' | 'Not set up';
};

function DescribeProviderLabel(settings: Settings): string {
  const translation = ResolveStageProvider(settings, 'translation');
  const translation_label = PROVIDER_LABELS[translation.provider];

  if (settings.image_reading.reader === 'ocr') {
    return `${OCR_READER_LABEL} + ${translation_label}`;
  }

  const reading = ResolveStageProvider(settings, 'image_reading');

  return reading.provider === translation.provider
    ? PROVIDER_LABELS[reading.provider]
    : `${PROVIDER_LABELS[reading.provider]} + ${translation_label}`;
}

export function DescribeProviderStatus(settings: Settings): ProviderStatus {
  const is_ready = IsProviderConfigured(settings);

  return {
    provider_label: DescribeProviderLabel(settings),
    is_ready,
    status_label: is_ready ? 'Ready' : 'Not set up'
  };
}
