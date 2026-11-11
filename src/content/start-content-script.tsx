import {
  CreatePreloadTabMessageHandler,
  type PreloadCommandTarget
} from '@/features/chapter-preload';
import {
  CreateTabMessageHandler,
  type TabCommandTarget
} from '@/features/chapter-translation';
import { CreatePageScanner } from '@/features/page-scanner';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ContentApp } from './content-app';
import content_css_text from './content.css?inline';
import { CreateShadowHost, InjectDocumentCss } from './lib/create-shadow-host';
import { TransformShadowCss } from './lib/transform-shadow-css';

export function StartContentScript(): void {
  if (window.top !== window) return;

  const scanner = CreatePageScanner();
  let tab_command_target: TabCommandTarget | null = null;
  let preload_command_target: PreloadCommandTarget | null = null;

  scanner.Start();
  chrome.runtime.onMessage.addListener(
    CreateTabMessageHandler(() => tab_command_target)
  );
  chrome.runtime.onMessage.addListener(
    CreatePreloadTabMessageHandler(() => preload_command_target)
  );

  const RegisterTabCommandTarget = (target: TabCommandTarget | null) => {
    tab_command_target = target;
  };
  const RegisterPreloadCommandTarget = (
    target: PreloadCommandTarget | null
  ) => {
    preload_command_target = target;
  };

  let is_mounted = false;
  let Unsubscribe: (() => void) | null = null;

  const MountWhenPagesFound = () => {
    if (is_mounted || scanner.GetPages().length < 1) return;

    is_mounted = true;
    Unsubscribe?.();

    const { shadow_css, document_css } = TransformShadowCss(
      content_css_text,
      asset_path => chrome.runtime.getURL(asset_path)
    );

    InjectDocumentCss(document_css);

    const shadow_host = CreateShadowHost(shadow_css);

    createRoot(shadow_host.mount_element).render(
      <StrictMode>
        <ContentApp
          scanner={scanner}
          shadow_host={shadow_host}
          RegisterTabCommandTarget={RegisterTabCommandTarget}
          RegisterPreloadCommandTarget={RegisterPreloadCommandTarget}
        />
      </StrictMode>
    );
  };

  Unsubscribe = scanner.Subscribe(MountWhenPagesFound);
  // The first scan may have finished before the subscription existed.
  MountWhenPagesFound();

  if (is_mounted) Unsubscribe();
}
