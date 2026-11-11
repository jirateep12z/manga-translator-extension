import { ToErrorCode } from '@/lib/app-error';
import { CreateProvider, type ProviderName } from '@/services/ai-provider';
import type { ErrorCode } from '@/types/error-code';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreateProviderConnection } from '../lib/stage-provider';
import type { Settings } from '../types/settings';

export type ConnectionTestStatus = 'idle' | 'testing' | 'succeeded' | 'failed';

const CONNECTION_FAILED_MESSAGES: Partial<Record<ErrorCode, string>> = {
  PROVIDER_AUTH_FAILED: 'The API key was rejected.',
  OLLAMA_UNREACHABLE: "Ollama isn't reachable at this URL.",
  OLLAMA_ORIGIN_BLOCKED:
    'Ollama blocked the request. Set OLLAMA_ORIGINS and restart Ollama.',
  PROVIDER_CREDIT_EXHAUSTED: 'Your OpenRouter credit has run out.'
};
const DEFAULT_CONNECTION_FAILED_MESSAGE = "The provider isn't responding.";

export function UseConnectionTest() {
  const [status, set_status] = useState<ConnectionTestStatus>('idle');
  const [message, set_message] = useState('');
  const controller_ref = useRef<AbortController | null>(null);

  useEffect(() => () => controller_ref.current?.abort(), []);

  const RunTest = useCallback((provider: ProviderName, settings: Settings) => {
    controller_ref.current?.abort();

    const controller = new AbortController();

    controller_ref.current = controller;
    set_status('testing');
    set_message('Testing…');

    CreateProvider(provider, CreateProviderConnection(settings))
      .TestConnection(controller.signal)
      .then(() => {
        if (controller_ref.current !== controller) return;

        set_status('succeeded');
        set_message('Connected.');
      })
      .catch((error: unknown) => {
        if (controller_ref.current !== controller) return;

        set_status('failed');
        set_message(
          CONNECTION_FAILED_MESSAGES[ToErrorCode(error)] ??
            DEFAULT_CONNECTION_FAILED_MESSAGE
        );
      });
  }, []);

  return { status, message, RunTest };
}
