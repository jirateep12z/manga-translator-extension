export type ProviderName = 'openrouter' | 'ollama';

export type PipelineStage = 'image_reading' | 'translation';

export type ProviderConnection = {
  openrouter_api_key: string;
  ollama_base_url: string;
};

export type ReasoningEffortLevel =
  'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CompletionRequest = {
  model: string;
  system_prompt: string;
  user_text: string;
  images_base64_jpeg: string[];
  json_schema: Record<string, unknown>;
  temperature: number;
  // null sends no reasoning field, so the model uses its own default.
  reasoning_effort: ReasoningEffortLevel | null;
};

export type CompletionResult = {
  text: string;
  model: string;
};

export type ModelReasoning = {
  // Canonical order, never 'none'.
  supported_efforts: ReasoningEffortLevel[];
  is_mandatory: boolean;
  default_effort: ReasoningEffortLevel | null;
};

export type ModelInfo = {
  model_id: string;
  label: string;
  is_vision_capable: boolean | null;
  reasoning: ModelReasoning | null;
};

export interface AiProvider {
  CreateCompletion(
    request: CompletionRequest,
    signal: AbortSignal
  ): Promise<CompletionResult>;
  ListModels(signal: AbortSignal): Promise<ModelInfo[]>;
  TestConnection(signal: AbortSignal): Promise<void>;
}
