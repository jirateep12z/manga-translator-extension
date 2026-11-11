import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import type { TargetLanguage } from '@/features/settings';
import { UseChromeStorage } from '@/features/settings/ui';
import type { Theme } from '@/features/theme';
import { UseTheme } from '@/features/theme/ui';
import { IsChromeExtension } from '@/lib/is-chrome-extension';
import { Cn } from '@/lib/utils';
import { Languages, Settings } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Footer } from './components/footer';
import { Header } from './components/header';
import { SettingsPanel } from './components/settings-panel';
import { TranslatePanel } from './components/translate-panel';
import { TAB_VALUES } from './constants/popup';
import { UseActiveTabStatus } from './hooks/use-active-tab-status';
import type { TabValue } from './types/popup';

const FULL_SETTINGS_PATH = 'options.html#settings';

function OpenFullSettings(): void {
  if (IsChromeExtension()) {
    void chrome.tabs.create({
      url: chrome.runtime.getURL(FULL_SETTINGS_PATH)
    });

    return;
  }

  window.open(FULL_SETTINGS_PATH, '_blank', 'noopener,noreferrer');
}

const LOADING_VIEW = (
  <div className="flex h-full max-h-screen w-[420px] items-center justify-center bg-neutral-50 dark:bg-neutral-950">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  </div>
);

function CreateTabTriggerClassName(
  tab_value: TabValue,
  active_tab: TabValue
): string {
  return Cn(
    'px-0 hover:bg-muted/80 focus-visible:ring-[3px]',
    active_tab === tab_value &&
      'bg-background text-foreground hover:bg-background dark:border-input dark:bg-input/30 dark:text-foreground dark:hover:bg-input/30'
  );
}

export function PopupApp() {
  const {
    settings,
    is_loading,
    save_error_message,
    GetLatestSettings,
    SaveSettings
  } = UseChromeStorage();
  const [active_tab, set_active_tab] = useState<TabValue>('translate');
  const active_tab_status = UseActiveTabStatus();

  UseTheme(settings.theme);

  const HandleTargetLanguageChange = useCallback(
    (target_language: TargetLanguage) => {
      SaveSettings({ ...GetLatestSettings(), target_language });
    },
    [GetLatestSettings, SaveSettings]
  );

  const HandleThemeChange = useCallback(
    (theme: Theme) => {
      SaveSettings({ ...GetLatestSettings(), theme });
    },
    [GetLatestSettings, SaveSettings]
  );

  const HandleEnabledChange = useCallback(
    (is_enabled: boolean) => {
      SaveSettings({ ...GetLatestSettings(), is_enabled });
    },
    [GetLatestSettings, SaveSettings]
  );

  const HandleTabValueChange = useCallback(
    (next_tab: string) => {
      if (TAB_VALUES.has(next_tab)) {
        set_active_tab(next_tab as TabValue);
      }
    },
    [set_active_tab]
  );

  if (is_loading) {
    return LOADING_VIEW;
  }

  return (
    <div className="h-full max-h-screen w-[420px] overflow-y-auto bg-neutral-50 p-4 dark:bg-neutral-950">
      <Header />
      <Tabs
        value={active_tab}
        className="mt-4"
        onValueChange={HandleTabValueChange}
      >
        <TooltipProvider>
          <TabsList className="grid w-full grid-cols-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="translate"
                  className={CreateTabTriggerClassName('translate', active_tab)}
                  aria-label="Translate"
                >
                  <Languages />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Translate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="settings"
                  className={CreateTabTriggerClassName('settings', active_tab)}
                  aria-label="Settings"
                >
                  <Settings />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
          </TabsList>
        </TooltipProvider>
        <TabsContent value="translate" className="mt-4 space-y-4">
          <TranslatePanel
            settings={settings}
            tab_id={active_tab_status.tab_id}
            status={active_tab_status.status}
            is_loading={active_tab_status.is_loading}
            OnTargetLanguageChange={HandleTargetLanguageChange}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4 space-y-4">
          <SettingsPanel
            theme={settings.theme}
            is_enabled={settings.is_enabled}
            OnEnabledChange={HandleEnabledChange}
            OnOpenFullSettings={OpenFullSettings}
            OnThemeChange={HandleThemeChange}
          />
        </TabsContent>
      </Tabs>
      {save_error_message ? (
        <p role="alert" className="text-destructive mt-3 text-center text-xs">
          {save_error_message}
        </p>
      ) : null}
      <Footer />
    </div>
  );
}
