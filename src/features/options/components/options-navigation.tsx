import { Button } from '@/components/ui/button';
import { Cn } from '@/lib/utils';
import { Database, Library, Settings, type LucideIcon } from 'lucide-react';
import type { OptionsSection } from '../lib/options-section';

type OptionsNavigationProps = {
  active_section: OptionsSection;
  OnSectionChange: (section: OptionsSection) => void;
};

const NAVIGATION_ITEMS: {
  section: OptionsSection;
  label: string;
  Icon: LucideIcon;
}[] = [
  { section: 'series', label: 'Series', Icon: Library },
  { section: 'settings', label: 'Settings', Icon: Settings },
  { section: 'data', label: 'Data', Icon: Database }
];

export function OptionsNavigation({
  active_section,
  OnSectionChange
}: OptionsNavigationProps) {
  return (
    <nav aria-label="Options" className="flex gap-1 md:flex-col">
      {NAVIGATION_ITEMS.map(({ section, label, Icon }) => {
        const is_active = section === active_section;

        return (
          <Button
            key={section}
            variant="ghost"
            className={Cn('justify-start', is_active && 'bg-muted')}
            aria-current={is_active ? 'page' : undefined}
            onClick={() => OnSectionChange(section)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        );
      })}
    </nav>
  );
}
