/**
 * Parses a computed CSS colour, which browsers give as `rgb()` or `rgba()`,
 * into a GPU clear colour. Returns transparent black for anything else.
 */
export function parseComputedColor(value: string): GPUColorDict {
  const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!match) return { r: 0, g: 0, b: 0, a: 0 };
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  const channel = (i: number) => Number(parts[i]) / 255;
  const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
  return { r: channel(0), g: channel(1), b: channel(2), a: alpha };
}

function parseAlpha(value: string): number {
  return value.endsWith('%') ? parseFloat(value) / 100 : Number(value);
}
