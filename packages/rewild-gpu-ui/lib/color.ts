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
