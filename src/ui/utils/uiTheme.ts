/** The interface colour scheme the player picks. `system` follows the OS. */
export type UiTheme = 'light' | 'dark' | 'system';

export const UI_THEMES: UiTheme[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'rewild.ui.theme';
// Null where matchMedia is missing (jsdom), so `system` resolves to light there.
const DEFAULT_THEME: UiTheme = 'dark';
const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

/** The stored choice, or dark when nothing is stored. */
export function getUiTheme(): UiTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return UI_THEMES.includes(value as UiTheme) ? (value as UiTheme) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Stores the choice and applies it straight away. */
export function setUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage is a convenience; the theme still applies for this session.
  }
  applyUiTheme();
}

/**
 * Sets `data-theme` on the root element, which switches the colour variables
 * in style.css. A `system` choice resolves to light or dark here.
 */
export function applyUiTheme(): void {
  const theme = getUiTheme();
  const dark =
    theme === 'dark' || (theme === 'system' && !!systemDark?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

// Follow the OS when it switches while the choice is `system`.
systemDark?.addEventListener('change', applyUiTheme);
