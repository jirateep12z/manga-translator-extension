import { IsAppError } from '@/lib/app-error';
import {
  CreateProvider,
  type ModelInfo,
  type ProviderName
} from '@/services/ai-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreateProviderConnection } from '../lib/stage-provider';
import type { Settings } from '../types/settings';

const MODEL_LIST_FAILED_MESSAGE =
  "Couldn't load models. Check the connection and try again.";

export type ModelListState = {
  models: ModelInfo[];
  is_loading: boolean;
  error_message: string | null;
  Refresh: () => void;
};

function IsCanceled(error: unknown): boolean {
  return (
    (IsAppError(error) && error.error_code === 'CANCELED') ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

// Models load only when the user asks, so opening the page makes no
// network call.
export function UseModelList(
  provider: ProviderName,
  settings: Settings
): ModelListState {
  const [models, set_models] = useState<ModelInfo[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const controller_ref = useRef<AbortController | null>(null);
  const settings_ref = useRef(settings);

  settings_ref.current = settings;

  useEffect(() => {
    controller_ref.current?.abort();
    controller_ref.current = null;
    set_models([]);
    set_error_message(null);
    set_is_loading(false);
  }, [provider]);

  useEffect(() => () => controller_ref.current?.abort(), []);

  const Refresh = useCallback(() => {
    controller_ref.current?.abort();

    const controller = new AbortController();

    controller_ref.current = controller;
    set_is_loading(true);
    set_error_message(null);

    CreateProvider(provider, CreateProviderConnection(settings_ref.current))
      .ListModels(controller.signal)
      .then(next_models => {
        if (controller_ref.current === controller) set_models(next_models);
      })
      .catch((error: unknown) => {
        if (IsCanceled(error) || controller_ref.current !== controller) return;

        set_error_message(MODEL_LIST_FAILED_MESSAGE);
      })
      .finally(() => {
        if (controller_ref.current !== controller) return;

        controller_ref.current = null;
        set_is_loading(false);
      });
  }, [provider]);

  return { models, is_loading, error_message, Refresh };
}
