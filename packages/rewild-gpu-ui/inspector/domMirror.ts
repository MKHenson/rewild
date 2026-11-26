import { createElement, icons } from 'lucide';
import {
  cornerRadii,
  Edges,
  GLASS_BLUR,
  Length,
  themeVariable,
  UIBoxShadow,
  UIColor,
  UINode,
  UIStyle,
  UIThemeColor,
  UITransition,
  UITransitionProperty,
} from '../lib';

/** DOM elements with the same styles as a surface's tree. */
export interface DomMirror {
  element: HTMLElement;
  /**
   * Sets each element's style from its node again, after a node's style
   * changed. A changed property starts the element's CSS transition.
   */
  sync(): void;
}

/** An image as the DOM shows it: a URL and its size in CSS pixels. */
export interface MirrorImage {
  url: string;
  width: number;
  height: number;
}

/** Finds an image node's image for the DOM, or null until it loads. */
export type MirrorImages = (name: string) => MirrorImage | null;

/**
 * Builds DOM elements with the same styles as a surface's tree. An image
 * node shows its image as a background in its content box, so its children
 * draw over it as in Mica.
 */
export function mirrorTree(
  root: UINode,
  images: MirrorImages = () => null
): DomMirror {
  const elements = new Map<UINode, HTMLElement>();
  const element = mirrorNode(root, elements, images);
  const sync = () => {
    for (const [node, element] of elements) applyStyle(element, node, images);
    applyRootStyle(element.style);
  };
  applyRootStyle(element.style);
  return { element, sync };
}

function applyRootStyle(css: CSSStyleDeclaration): void {
  // The root fills the surface, whatever its own size and margin.
  css.position = 'relative';
  css.margin = '';
  css.width = '100%';
  css.height = '100%';
  // Mica's text defaults, in place of what the page passes down.
  css.fontFamily = 'Roboto, sans-serif';
  css.color ||= '#ffffff';
  css.fontSize ||= '16px';
  css.fontWeight ||= 'normal';
  css.lineHeight ||= 'normal';
  css.textAlign ||= 'left';
}

function mirrorNode(
  node: UINode,
  elements: Map<UINode, HTMLElement>,
  images: MirrorImages
): HTMLElement {
  const element = document.createElement('div');
  elements.set(node, element);
  applyStyle(element, node, images);
  if (node.icon !== null) {
    // Lucide's own SVG, as the DOM UI draws it. It fills the content box, and
    // its viewBox centres the largest square that fits, as in Mica.
    const svg = createElement(icons[pascalCase(node.icon)]);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';
    element.append(svg);
  }
  if (node.text !== null) {
    element.textContent = node.text;
  } else {
    for (const child of node.children)
      element.append(mirrorNode(child, elements, images));
  }
  return element;
}

function applyStyle(
  element: HTMLElement,
  node: UINode,
  images: MirrorImages
): void {
  const css = element.style;
  setStyle(css, node.style);
  if (node.image !== null) applyImage(css, node.style, images(node.image));
  // Items in a Mica scroll container do not shrink. In the DOM, the
  // automatic minimum size does that, which the mirror sets to 0.
  if (node.parent?.style.overflow === 'scroll') css.flexShrink = '0';
  // Text in a block, so it starts at the top left of the content box as in
  // Mica, and `text-overflow` applies.
  if (node.text !== null && css.display !== 'none') css.display = 'block';
}

const BACKGROUND_SIZES = {
  fill: '100% 100%',
  contain: 'contain',
  cover: 'cover',
} as const;

/**
 * The image as a background in the content box, placed as `object-fit` with
 * the centre as its position. With no width or height, the element takes
 * the image's size, as a Mica image node does.
 */
function applyImage(
  css: CSSStyleDeclaration,
  style: UIStyle,
  image: MirrorImage | null
): void {
  if (!image) return;
  css.backgroundImage = `url("${image.url}")`;
  css.backgroundSize = BACKGROUND_SIZES[style.objectFit ?? 'contain'];
  css.backgroundPosition = 'center';
  css.backgroundRepeat = 'no-repeat';
  css.backgroundOrigin = 'content-box';
  css.backgroundClip = 'content-box';
  const { width, height } = style;
  const ratio = image.width / image.height;
  // The image is the content box. Padding and border go round it.
  const sides = (edges: Edges | undefined, a: number, b: number) => {
    if (edges === undefined) return 0;
    const list = Array.isArray(edges) ? edges : [edges, edges, edges, edges];
    return [list[a], list[b]].reduce<number>(
      (sum, v) => sum + (typeof v === 'number' ? v : 0),
      0
    );
  };
  const border = 2 * (style.borderWidth ?? 0);
  const extraX = sides(style.padding, 1, 3) + border;
  const extraY = sides(style.padding, 0, 2) + border;
  if (width === undefined && height === undefined) {
    css.width = `${image.width + extraX}px`;
    css.height = `${image.height + extraY}px`;
  } else if (height === undefined && typeof width === 'number' && ratio) {
    css.height = `${(width - extraX) / ratio + extraY}px`;
  } else if (width === undefined && typeof height === 'number' && ratio) {
    css.width = `${(height - extraY) * ratio + extraX}px`;
  }
}

function setStyle(css: CSSStyleDeclaration, style: UIStyle): void {
  css.backgroundImage = '';
  css.boxSizing = 'border-box';
  // Each Mica node is a flex container with no automatic minimum size.
  css.display = style.display ?? 'flex';
  css.position = style.position ?? 'relative';
  css.top = length(style.top);
  css.right = length(style.right);
  css.bottom = length(style.bottom);
  css.left = length(style.left);
  css.width = length(style.width);
  css.height = length(style.height);
  css.minWidth = length(style.minWidth) || '0';
  css.maxWidth = length(style.maxWidth);
  css.minHeight = length(style.minHeight) || '0';
  css.maxHeight = length(style.maxHeight);
  css.padding = edges(style.padding);
  css.margin = edges(style.margin);
  css.flexDirection = style.flexDirection ?? '';
  css.flexWrap = style.flexWrap ?? '';
  css.gap = style.gap === undefined ? '' : `${style.gap}px`;
  css.flexGrow = style.flexGrow === undefined ? '' : String(style.flexGrow);
  css.flexShrink =
    style.flexShrink === undefined ? '' : String(style.flexShrink);
  css.flexBasis = style.flexBasis === 'auto' ? 'auto' : length(style.flexBasis);
  css.justifyContent = style.justifyContent ?? '';
  css.alignItems = style.alignItems ?? '';
  css.alignSelf = style.alignSelf ?? '';
  css.backgroundColor = color(style.backgroundColor);
  css.borderStyle = 'solid';
  css.borderWidth = `${style.borderWidth ?? 0}px`;
  css.borderColor = color(style.borderColor) || 'transparent';
  css.borderRadius = cornerRadii(style.borderRadius)
    .map((r) => `${r}px`)
    .join(' ');
  css.opacity = style.opacity === undefined ? '' : String(style.opacity);
  css.boxShadow = boxShadow(style.boxShadow);
  css.backdropFilter =
    style.backdrop === 'glass' ? `blur(${GLASS_BLUR}px) saturate(150%)` : '';
  const t = style.transform;
  css.transform = t
    ? `translate(${t.x ?? 0}px, ${t.y ?? 0}px) scale(${t.scale ?? 1})`
    : '';
  css.transition = transition(style.transition);
  css.overflow = style.overflow === 'scroll' ? 'auto' : style.overflow ?? '';
  css.color = color(style.color);
  css.fontSize = style.fontSize === undefined ? '' : `${style.fontSize}px`;
  css.fontWeight = style.fontWeight ?? '';
  css.lineHeight =
    style.lineHeight === undefined ? '' : String(style.lineHeight);
  css.textAlign = style.textAlign ?? '';
  // These two do not pass down in Mica, so each element sets its own.
  css.whiteSpace = style.whiteSpace ?? 'normal';
  css.textOverflow = style.textOverflow ?? 'clip';
}

/** A hex colour as it is, and a theme colour as its custom property. */
function color(value: UIColor | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'object')
    return `color-mix(in srgb, var(${themeVariable(value.theme)}) ${
      value.alpha * 100
    }%, transparent)`;
  return value.startsWith('#')
    ? value
    : `var(${themeVariable(value as UIThemeColor)})`;
}

function boxShadow(value: UIBoxShadow | UIBoxShadow[] | undefined): string {
  if (!value) return '';
  return (Array.isArray(value) ? value : [value])
    .map(
      (s) =>
        `${s.inset ? 'inset ' : ''}${s.x ?? 0}px ${s.y ?? 0}px ${
          s.blur ?? 0
        }px ${s.spread ?? 0}px ${color(s.color)}`
    )
    .join(', ');
}

const CSS_PROPERTIES: Record<UITransitionProperty, string> = {
  backgroundColor: 'background-color',
  borderColor: 'border-color',
  color: 'color',
  opacity: 'opacity',
  transform: 'transform',
};

/** `all` lists Mica's properties, so layout properties do not transition in the DOM either. */
function transition(value: UITransition | UITransition[] | undefined): string {
  if (!value) return '';
  return (Array.isArray(value) ? value : [value])
    .flatMap((t) => {
      const timing = `${t.duration}ms ${t.easing ?? 'ease'} ${t.delay ?? 0}ms`;
      const keys =
        t.property === 'all'
          ? (Object.keys(CSS_PROPERTIES) as UITransitionProperty[])
          : [t.property];
      return keys.map((key) => `${CSS_PROPERTIES[key]} ${timing}`);
    })
    .join(', ');
}

/** `chevron-down` to `ChevronDown`, the name lucide exports it under. */
function pascalCase(name: string): keyof typeof icons {
  return name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) =>
    c.toUpperCase()
  ) as keyof typeof icons;
}

function edges(value: Edges | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.map(length).join(' ') : length(value);
}

function length(value: Length | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'number' ? `${value}px` : value;
}
