import { Spinner } from '@/components/ui/spinner';
import { DataSection, SeriesSection } from '@/features/memory-manager';
import { SettingsForm, UseChromeStorage } from '@/features/settings/ui';
import { UseTheme } from '@/features/theme/ui';
import { Languages } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OptionsNavigation } from './components/options-navigation';
import {
  CreateOptionsHash,
  ParseOptionsSection,
  type OptionsSection
} from './lib/options-section';

function UseOptionsSection() {
  const [active_section, set_active_section] = useState<OptionsSection>(() =>
    ParseOptionsSection(window.location.hash)
  );

  useEffect(() => {
    const HandleHashChange = () =>
      set_active_section(ParseOptionsSection(window.location.hash));

    window.addEventListener('hashchange', HandleHashChange);

    return () => window.removeEventListener('hashchange', HandleHashChange);
  }, []);

  const ChangeSection = (section: OptionsSection) => {
    set_active_section(section);
    window.location.hash = CreateOptionsHash(section);
  };

  return { active_section, ChangeSection };
}

export function OptionsApp() {
  const { settings, is_loading, save_error_message, SaveSettings } =
    UseChromeStorage();
  const { active_section, ChangeSection } = UseOptionsSection();

  UseTheme(settings.theme);

  function RenderSection() {
    switch (active_section) {
      case 'series':
        return (
          <SeriesSection default_target_language={settings.target_language} />
        );
      case 'settings':
        return (
          <SettingsForm
            settings={settings}
            save_error_message={save_error_message}
            OnSettingsChange={SaveSettings}
          />
        );
      case 'data':
        return <DataSection />;
    }
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <header className="mb-6 flex items-center gap-3 border-b pb-4">
          <Languages aria-hidden="true" className="size-6" />
          <h1 className="text-xl font-bold">Manga Translator</h1>
        </header>
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[200px_1fr]">
          <OptionsNavigation
            active_section={active_section}
            OnSectionChange={ChangeSection}
          />
          <main className="min-w-0">
            {is_loading ? (
              <p
                role="status"
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <Spinner aria-hidden="true" />
                Loading…
              </p>
            ) : (
              RenderSection()
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
