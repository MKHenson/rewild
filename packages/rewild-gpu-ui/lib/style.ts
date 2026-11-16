/** Pixels as a number, or a percentage of the containing block. */
export type Length = number | `${number}%`;

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export type UIColor = `#${string}`;

/** One radius for all corners, or top left, top right, bottom right, bottom left. */
export type CornerRadius = number | [number, number, number, number];

export interface UIStyle {
  position?: 'relative' | 'absolute';
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
  width?: Length;
  height?: Length;

  backgroundColor?: UIColor;
  borderColor?: UIColor;
  borderWidth?: number;
  borderRadius?: CornerRadius;
  opacity?: number;
  /** `hidden` clips the children to the inside of the border. */
  overflow?: 'visible' | 'hidden';
}

const LAYOUT_KEYS = new Set<keyof UIStyle>([
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'borderWidth',
]);

/** True when a change to the property can move or resize boxes. */
export function affectsLayout(key: keyof UIStyle): boolean {
  return LAYOUT_KEYS.has(key);
}

export function resolveLength(
  value: Length | undefined,
  base: number
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return (parseFloat(value) / 100) * base;
}

export function cornerRadii(
  radius: CornerRadius | undefined
): [number, number, number, number] {
  if (radius === undefined) return [0, 0, 0, 0];
  if (typeof radius === 'number') return [radius, radius, radius, radius];
  return radius;
}
