import type { HexColor, UIColor } from './style';
import type { UITheme, UIThemeColor } from './theme';

export type RGBA = [number, number, number, number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Parses a hex colour to straight alpha channels from 0 to 1. */
export function parseColor(color: HexColor | undefined): RGBA {
  if (!color) return TRANSPARENT;
  let hex = color.slice(1);
  if (hex.length === 3 || hex.length === 4)
    hex = [...hex].map((c) => c + c).join('');
  if (hex.length === 6) hex += 'ff';
  if (hex.length !== 8 || !/^[0-9a-f]+$/i.test(hex)) return TRANSPARENT;
  const value = parseInt(hex, 16);
  return [
    ((value >>> 24) & 255) / 255,
    ((value >>> 16) & 255) / 255,
    ((value >>> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

/**
 * A hex colour, or a theme colour from the theme. A theme colour is
 * transparent with no theme.
 */
export function resolveColor(
  color: UIColor | undefined,
  theme: UITheme | null | undefined
): RGBA {
  if (color === undefined) return TRANSPARENT;
  if (typeof color === 'object') {
    const [r, g, b, a] = theme?.color(color.theme) ?? TRANSPARENT;
    return [r, g, b, a * Math.min(1, Math.max(0, color.alpha))];
  }
  if (color.startsWith('#')) return parseColor(color as HexColor);
  return theme?.color(color as UIThemeColor) ?? TRANSPARENT;
}

/**
 * Mixes two straight alpha colours with premultiplied alpha, as CSS
 * interpolates colours, so a fade to transparent does not darken.
 */
export function mixColors(a: RGBA, b: RGBA, t: number): RGBA {
  const alpha = a[3] + (b[3] - a[3]) * t;
  if (alpha <= 0) return [0, 0, 0, 0];
  const channel = (i: number) =>
    (a[i] * a[3] + (b[i] * b[3] - a[i] * a[3]) * t) / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

/** Writes channels from 0 to 1 as `#rrggbb`. */
export function hexColor(r: number, g: number, b: number): HexColor {
  const channel = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Packs a colour's red, green and blue into one float, as
 * r * 65536 + g * 256 + b with channels from 0 to 255. A float holds it with
 * no loss. Effects unpack it in WGSL.
 */
export function packColor(color: RGBA): number {
  const [r, g, b] = color.map((c) => Math.round(c * 255));
  return r * 65536 + g * 256 + b;
}
