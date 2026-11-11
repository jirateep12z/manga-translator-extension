export const OPTIONS_SECTIONS = ['series', 'settings', 'data'] as const;

export type OptionsSection = (typeof OPTIONS_SECTIONS)[number];

const DEFAULT_OPTIONS_SECTION: OptionsSection = 'series';

function IsOptionsSection(value: string): value is OptionsSection {
  return (OPTIONS_SECTIONS as readonly string[]).includes(value);
}

export function ParseOptionsSection(hash: string): OptionsSection {
  const section_name = hash.startsWith('#') ? hash.slice(1) : hash;

  return IsOptionsSection(section_name)
    ? section_name
    : DEFAULT_OPTIONS_SECTION;
}

export function CreateOptionsHash(section: OptionsSection): string {
  return `#${section}`;
}
