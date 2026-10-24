/**
 * Appearance (colour palette) preference. Purely cosmetic and stored separately
 * from demo progress. Every storage access is guarded so a blocked or full
 * localStorage can never break the UI; unknown values fall back to the default.
 */
export type ThemeId = 'sea' | 'slate' | 'stone';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Browser chrome colour (meta theme-color); mirrors the palette's --canvas. */
  themeColor: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: 'sea', label: 'Sea glass', themeColor: '#eaf0ef' },
  { id: 'slate', label: 'Slate blue', themeColor: '#e9edf2' },
  { id: 'stone', label: 'Warm stone', themeColor: '#efebe4' },
];

export const DEFAULT_THEME: ThemeId = 'sea';
export const APPEARANCE_KEY = 'empirical.appearance.v1';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

export function readTheme(): ThemeId {
  try {
    const v = globalThis.localStorage?.getItem(APPEARANCE_KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: ThemeId): void {
  try {
    globalThis.localStorage?.setItem(APPEARANCE_KEY, id);
  } catch {
    /* storage unavailable: the choice still applies for this session */
  }
}

/** Sets data-theme on <html> (tokens.css keys off it) and updates meta theme-color. */
export function applyTheme(id: ThemeId): void {
  const safe = isThemeId(id) ? id : DEFAULT_THEME;
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = safe;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const opt = THEMES.find((t) => t.id === safe)!;
  if (meta) meta.content = opt.themeColor;
}
