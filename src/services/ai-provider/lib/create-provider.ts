import { CreateOllamaProvider } from '../services/ollama-provider.service';
import { CreateOpenRouterProvider } from '../services/openrouter-provider.service';
import type {
  AiProvider,
  ProviderConnection,
  ProviderName
} from '../types/provider';

export function CreateProvider(
  provider: ProviderName,
  connection: ProviderConnection
): AiProvider {
  switch (provider) {
    case 'ollama':
      return CreateOllamaProvider(connection);
    case 'openrouter':
      return CreateOpenRouterProvider(connection);
  }
}
