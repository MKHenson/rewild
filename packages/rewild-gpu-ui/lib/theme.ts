import { parseColor, RGBA } from './color';

/**
 * The theme colours Mica reads from the document. Each name is the one
 * `theme.colors` uses in rewild-ui, and each is a CSS custom property in
 * style.css: `onSurface` is `--on-surface`.
 */
export const THEME_COLORS = [
  'primary400',
  'primary500',
  'primary600',
  'primaryText',
  'secondary400',
  'secondary500',
  'secondary600',
  'subtle400',
  'subtle500',
  'subtle600',
  'error400',
  'error500',
  'error600',
  'success400',
  'success500',
  'success600',
  'warning400',
  'warning500',
  'warning600',
  'onPrimary400',
  'onPrimary500',
  'onPrimary600',
  'onSecondary400',
  'onSecondary500',
  'onSecondary600',
  'onBackground',
  'onSurface',
  'onSubtle',
  'onSurfaceLight',
  'onSurfaceLighter',
  'onSurfaceBorder',
  'onField',
  'fieldFill',
  'onError400',
  'onError500',
  'onError600',
  'onWarning400',
  'onWarning500',
  'onWarning600',
  'background',
  'surface',
  'glassEdge',
] as const;

export type UIThemeColor = typeof THEME_COLORS[number];

const THEME_NAMES = new Set<string>(THEME_COLORS);

const TRANSPARENT: RGBA = [0, 0, 0, 0];

export function isThemeColor(value: string): value is UIThemeColor {
  return THEME_NAMES.has(value);
}

/** `onSurfaceLight` to `--on-surface-light`. */
export function themeVariable(name: UIThemeColor): string {
  return `--${name.replace(/([A-Z]|\d+)/g, '-$1').toLowerCase()}`;
}

/**
 * Parses a colour as CSS writes it in a custom property: hex, `rgb()` or
 * `rgba()`, with commas or spaces. Returns null for anything else.
 */
export function parseCssColor(value: string): RGBA | null {
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex))
      return null;
    return parseColor(`#${hex}`);
  }
  const match = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (part: string) =>
    part.endsWith('%') ? parseFloat(part) / 100 : Number(part) / 255;
  const alpha =
    parts[3] === undefined
      ? 1
      : parts[3].endsWith('%')
      ? parseFloat(parts[3]) / 100
      : Number(parts[3]);
  const rgba = [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
  if (rgba.some((c) => !Number.isFinite(c))) return null;
  return rgba.map((c) => Math.min(1, Math.max(0, c))) as RGBA;
}

/**
 * The DOM's theme colours, as numbers. A style names a theme colour, so a
 * colour changed in style.css changes both UIs. Until `read` runs, each
 * colour is transparent.
 */
export class UITheme {
  /** Goes up by one each time a colour changes. */
  revision = 0;
  private values = new Map<UIThemeColor, RGBA>();

  /** The colour, or transparent when the document does not set it. */
  color(name: UIThemeColor): RGBA {
    return this.values.get(name) ?? TRANSPARENT;
  }

  /** Sets colours by hand, as in a test or a page with no style.css. */
  set(colors: Partial<Record<UIThemeColor, RGBA>>): void {
    for (const [name, rgba] of Object.entries(colors))
      this.values.set(name as UIThemeColor, rgba);
    this.revision++;
  }

  /** Reads the computed colours from an element, by default the document's root. */
  read(element: Element = document.documentElement): void {
    const computed = getComputedStyle(element);
    const values = new Map<UIThemeColor, RGBA>();
    for (const name of THEME_COLORS) {
      const rgba = parseCssColor(
        computed.getPropertyValue(themeVariable(name))
      );
      if (rgba) values.set(name, rgba);
    }
    if (sameValues(values, this.values)) return;
    this.values = values;
    this.revision++;
  }

  /**
   * Reads the colours again when the root's `data-theme`, `class` or
   * `style` changes, which is how the app switches theme. Returns a function
   * that stops watching.
   */
  watch(element: Element = document.documentElement): () => void {
    const observer = new MutationObserver(() => this.read(element));
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
  }
}

function sameValues(
  a: Map<UIThemeColor, RGBA>,
  b: Map<UIThemeColor, RGBA>
): boolean {
  if (a.size !== b.size) return false;
  for (const [name, rgba] of a) {
    const other = b.get(name);
    if (!other || other.some((c, i) => c !== rgba[i])) return false;
  }
  return true;
}
