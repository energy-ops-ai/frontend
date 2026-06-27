export const THEMES = [
  {
    id: 'ember',
    name: 'Ember',
    description: 'Dark operations room with warm alerts.',
    swatches: ['#09090b', '#d97757', '#27272a']
  },
  {
    id: 'grid',
    name: 'Grid',
    description: 'Cool command-center palette for network views.',
    swatches: ['#080b12', '#38bdf8', '#1f2937']
  },
  {
    id: 'field',
    name: 'Field',
    description: 'Low-glare green palette for live plant monitoring.',
    swatches: ['#0d120b', '#84cc16', '#273321']
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Bright theme for reports and shared screens.',
    swatches: ['#f8fafc', '#2563eb', '#e5e7eb']
  }
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'ember';

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some(theme => theme.id === value);
}
