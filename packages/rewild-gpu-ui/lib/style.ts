/** Pixels as a number, or a percentage of the containing block. */
export type Length = number | `${number}%`;

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export type UIColor = `#${string}`;

/** One radius for all corners, or top left, top right, bottom right, bottom left. */
export type CornerRadius = number | [number, number, number, number];

/** One length for all sides, or top, right, bottom, left. Percentages are of the containing block's width, as in CSS. */
export type Edges = Length | [Length, Length, Length, Length];

/** Resolved pixels for top, right, bottom, left. */
export type Sides = [number, number, number, number];

export type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch';

export interface UIStyle {
  /** Each node is a flex container. `none` removes the node and its children from layout and drawing. */
  display?: 'flex' | 'none';
  position?: 'relative' | 'absolute';
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
  /** The border box size, as `box-sizing: border-box`. */
  width?: Length;
  height?: Length;
  /** Defaults to 0. Mica has no automatic minimum size from the content. */
  minWidth?: Length;
  maxWidth?: Length;
  /** Defaults to 0. */
  minHeight?: Length;
  maxHeight?: Length;
  padding?: Edges;
  margin?: Edges;

  /** Defaults to `row`, as in CSS. */
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap';
  /** The space between items and between lines. */
  gap?: number;
  flexGrow?: number;
  /** Defaults to 1. */
  flexShrink?: number;
  flexBasis?: Length | 'auto';
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  /** Defaults to `stretch`. */
  alignItems?: FlexAlign;
  alignSelf?: 'auto' | FlexAlign;

  backgroundColor?: UIColor;
  borderColor?: UIColor;
  borderWidth?: number;
  borderRadius?: CornerRadius;
  opacity?: number;
  /** `hidden` clips the children to the inside of the border. */
  overflow?: 'visible' | 'hidden';
}

const LAYOUT_KEYS = new Set<keyof UIStyle>([
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'padding',
  'margin',
  'flexDirection',
  'flexWrap',
  'gap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'borderWidth',
]);

/** True when a change to the property can move or resize boxes. */
export function affectsLayout(key: keyof UIStyle): boolean {
  return LAYOUT_KEYS.has(key);
}

/** Resolves to pixels. A percentage of an unknown base resolves to undefined, as `auto`. */
export function resolveLength(
  value: Length | undefined,
  base: number | undefined
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (base === undefined) return undefined;
  return (parseFloat(value) / 100) * base;
}

/** Resolves edges to pixels. A percentage of an unknown base is 0. */
export function resolveEdges(
  edges: Edges | undefined,
  base: number | undefined
): Sides {
  if (edges === undefined) return [0, 0, 0, 0];
  const list = Array.isArray(edges) ? edges : [edges, edges, edges, edges];
  return list.map((e) => resolveLength(e, base) ?? 0) as Sides;
}

export function cornerRadii(
  radius: CornerRadius | undefined
): [number, number, number, number] {
  if (radius === undefined) return [0, 0, 0, 0];
  if (typeof radius === 'number') return [radius, radius, radius, radius];
  return radius;
}
