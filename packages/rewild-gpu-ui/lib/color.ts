import { UIColor } from './style';

export type RGBA = [number, number, number, number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Parses a hex colour to straight alpha channels from 0 to 1. */
export function parseColor(color: UIColor | undefined): RGBA {
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

/** Writes channels from 0 to 1 as `#rrggbb`. */
export function hexColor(r: number, g: number, b: number): UIColor {
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
