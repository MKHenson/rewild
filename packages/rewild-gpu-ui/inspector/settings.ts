export type InspectorTheme = 'light' | 'dark';

/** `screen` follows the display. A number forces that ratio. */
export type PixelRatioChoice = 'screen' | 1 | 1.5 | 2 | 3;

export const PIXEL_RATIOS: PixelRatioChoice[] = ['screen', 1, 1.5, 2, 3];

export interface InspectorSettings {
  theme: InspectorTheme;
  pixelRatio: PixelRatioChoice;
  layoutOverlay: boolean;
}

const STORAGE_KEY = 'rewild.ui-inspector';
const DEFAULTS: InspectorSettings = {
  theme: 'dark',
  pixelRatio: 'screen',
  layoutOverlay: false,
};

export function loadSettings(): InspectorSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      theme: stored.theme === 'light' ? 'light' : DEFAULTS.theme,
      pixelRatio: PIXEL_RATIOS.includes(stored.pixelRatio)
        ? stored.pixelRatio
        : DEFAULTS.pixelRatio,
      layoutOverlay: stored.layoutOverlay === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: InspectorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is a convenience; the settings still apply for this session.
  }
}

export function resolvePixelRatio(choice: PixelRatioChoice): number {
  return choice === 'screen' ? window.devicePixelRatio || 1 : choice;
}
