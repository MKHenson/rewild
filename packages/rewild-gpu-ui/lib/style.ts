/** Pixels as a number, or a percentage of the containing block. */
export type Length = number | `${number}%`;

import type { UIThemeColor } from './theme';

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export type HexColor = `#${string}`;

/**
 * A theme colour with its alpha scaled by `alpha`, from 0 to 1. It is the
 * DOM's `color-mix(in srgb, var(--surface) 60%, transparent)`.
 */
export interface UIThemeColorAlpha {
  theme: UIThemeColor;
  alpha: number;
}

/** A hex colour, or a theme colour by name, such as `surface`. See `UITheme`. */
export type UIColor = HexColor | UIThemeColor | UIThemeColorAlpha;

/** One radius for all corners, or top left, top right, bottom right, bottom left. */
export type CornerRadius = number | [number, number, number, number];

/** One length for all sides, or top, right, bottom, left. Percentages are of the containing block's width, as in CSS. */
export type Edges = Length | [Length, Length, Length, Length];

/** Resolved pixels for top, right, bottom, left. */
export type Sides = [number, number, number, number];

export type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch';

/**
 * One CSS box shadow, in CSS pixels. An outer shadow draws under the box and
 * only outside it, so a see-through box does not show it. An inset shadow
 * draws inside the padding box, over the background.
 */
export interface UIBoxShadow {
  x?: number;
  y?: number;
  /** The CSS blur radius. The shadow's edge is a Gaussian with half this as its deviation. */
  blur?: number;
  /** Grows an outer shadow and shrinks an inset one. */
  spread?: number;
  color: UIColor;
  inset?: boolean;
}

/**
 * A move and a uniform scale, applied when the node draws, after layout. It
 * does not move other nodes. The scale is about the centre of the box, as
 * CSS's `translate(x, y) scale(s)` with the default origin.
 */
export interface UITransform {
  x?: number;
  y?: number;
  scale?: number;
}

/** The properties that transition. Layout properties do not. */
export type UITransitionProperty =
  | 'backgroundColor'
  | 'borderColor'
  | 'color'
  | 'opacity'
  | 'transform';

/** The CSS easing keywords. */
export type UIEasing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

/**
 * Eases a property from the value it shows to a new one, as a CSS
 * transition. Times are in milliseconds.
 */
export interface UITransition {
  /** `all` is every property in `UITransitionProperty`. */
  property: UITransitionProperty | 'all';
  duration: number;
  /** Defaults to `ease`, as in CSS. */
  easing?: UIEasing;
  delay?: number;
}

export type FontWeight = 'normal' | 'bold';
export type TextAlign = 'left' | 'center' | 'right';

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
  /** The first shadow draws on top, as in CSS. */
  boxShadow?: UIBoxShadow | UIBoxShadow[];
  /**
   * `glass` blurs what is under the box and raises its saturation, as the
   * DOM's `backdrop-filter: blur(18px) saturate(150%)`. The background colour
   * lies over it. Pair it with a see-through background, as `glassSurface()`.
   */
  backdrop?: 'none' | 'glass';
  transform?: UITransform;
  /** One transition, or one per property. */
  transition?: UITransition | UITransition[];
  /**
   * `hidden` clips the node's text and its children to the inside of the
   * border. `scroll` clips the same, and the content can scroll on each axis
   * where it is larger than the node. See `UINode.scrollTo`.
   */
  overflow?: 'visible' | 'hidden' | 'scroll';

  /** The text colour. Passes down to children. Defaults to white, for text over the game. */
  color?: UIColor;
  /** In CSS pixels. Passes down. Defaults to 16. */
  fontSize?: number;
  /** Passes down. Defaults to `normal`. */
  fontWeight?: FontWeight;
  /**
   * A multiple of the font size, as a unitless CSS `line-height`. `normal`
   * uses the font's own line height. Passes down. Defaults to `normal`.
   */
  lineHeight?: number | 'normal';
  /** Passes down. Defaults to `left`. A line too long for its box aligns left. */
  textAlign?: TextAlign;
  /**
   * `normal` joins runs of spaces and line breaks into one space and wraps.
   * `nowrap` joins them and does not wrap. `pre-line` keeps line breaks and
   * wraps. It does not pass down.
   */
  whiteSpace?: 'normal' | 'nowrap' | 'pre-line';
  /**
   * `ellipsis` ends a line too long for its box with "…". It needs
   * `overflow: 'hidden'`, as in CSS. It does not pass down.
   */
  textOverflow?: 'clip' | 'ellipsis';

  /**
   * `none` keeps the node out of the hit test, so pointer events go to what
   * is under it. Its children can still be hit. It does not pass down.
   */
  pointerEvents?: 'auto' | 'none';
  /**
   * The node takes focus: from a click, Tab, the arrow keys or the gamepad.
   * It does not pass down.
   */
  focusable?: boolean;
}

/** The text properties that pass from a parent to its children, as in CSS. */
export const INHERITED_KEYS = [
  'color',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
] as const;

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
  'overflow',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'whiteSpace',
]);

/**
 * True when a change to the property does not change what draws: it changes
 * only input, or how later changes transition.
 */
export function affectsNoDrawing(key: keyof UIStyle): boolean {
  return key === 'pointerEvents' || key === 'focusable' || key === 'transition';
}

/** True when the node clips its text and its children, as `hidden` and `scroll` do. */
export function clipsContent(style: UIStyle): boolean {
  return style.overflow === 'hidden' || style.overflow === 'scroll';
}

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
