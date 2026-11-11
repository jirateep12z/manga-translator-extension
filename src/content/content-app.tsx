import type { PreloadCommandTarget } from '@/features/chapter-preload';
import type { TabCommandTarget } from '@/features/chapter-translation';
import type { PageScanner } from '@/features/page-scanner';
import { ContentPage } from './components/content-page';
import { UsePublicSettings } from './hooks/use-public-settings';
import type { ShadowHost } from './lib/create-shadow-host';

type ContentAppProps = {
  scanner: PageScanner;
  shadow_host: ShadowHost;
  RegisterTabCommandTarget: (target: TabCommandTarget | null) => void;
  RegisterPreloadCommandTarget: (target: PreloadCommandTarget | null) => void;
};

// The page UI mounts only after settings confirm the extension is on, so a
// disabled extension sends no page messages. Turning it off unmounts the page
// UI, which cancels the queue, closes the port, clears page state, and
// unregisters tab commands.
export function ContentApp({
  scanner,
  shadow_host,
  RegisterTabCommandTarget,
  RegisterPreloadCommandTarget
}: ContentAppProps) {
  const { public_settings, UpdateTargetLanguage } = UsePublicSettings();

  if (public_settings?.is_enabled !== true) return null;

  return (
    <ContentPage
      public_settings={public_settings}
      scanner={scanner}
      shadow_host={shadow_host}
      RegisterTabCommandTarget={RegisterTabCommandTarget}
      RegisterPreloadCommandTarget={RegisterPreloadCommandTarget}
      UpdateTargetLanguage={UpdateTargetLanguage}
    />
  );
}
