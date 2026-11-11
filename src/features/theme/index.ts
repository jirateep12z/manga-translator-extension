// React-free public entry; hooks are exported from './ui' so that non-UI
// modules never load React.
export { VALID_THEMES } from './constants/theme';
export { ApplyTheme } from './lib/apply-theme';
export type { ResolvedTheme, Theme } from './types/theme';
