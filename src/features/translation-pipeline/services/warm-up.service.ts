import { WarmUpOcr } from '@/features/ocr-reader';
import { ReadSettings, ResolveProviderStages } from '@/features/settings';
import { WarmUpOllamaModel } from '@/services/ai-provider';

// With the OCR reader, OCR warms up first. Then only the stages that call a
// provider warm their Ollama models (spec 0002 §9.2).
export async function WarmUpPipelineModels(signal: AbortSignal): Promise<void> {
  const settings = await ReadSettings();

  if (settings.image_reading.reader === 'ocr') {
    await WarmUpOcr(signal);
  }

  const ollama_models = new Set(
    ResolveProviderStages(settings)
      .filter(stage => stage.provider === 'ollama' && stage.model !== '')
      .map(stage => stage.model)
  );

  for (const model of ollama_models) {
    await WarmUpOllamaModel(settings.ollama_base_url, model, signal);
  }
}
