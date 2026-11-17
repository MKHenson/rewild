import { cornerRadii, Edges, Length, UINode, UIStyle } from '../lib';

/** Builds DOM elements with the same styles as a surface's tree. */
export function mirrorTree(root: UINode): HTMLElement {
  const element = mirrorNode(root);
  // The root fills the surface, whatever its own size and margin.
  element.style.position = 'relative';
  element.style.margin = '';
  element.style.width = '100%';
  element.style.height = '100%';
  return element;
}

function mirrorNode(node: UINode): HTMLElement {
  const element = document.createElement('div');
  applyStyle(element.style, node.style);
  for (const child of node.children) element.append(mirrorNode(child));
  return element;
}

function applyStyle(css: CSSStyleDeclaration, style: UIStyle): void {
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
  css.backgroundColor = style.backgroundColor ?? '';
  css.borderStyle = 'solid';
  css.borderWidth = `${style.borderWidth ?? 0}px`;
  css.borderColor = style.borderColor ?? 'transparent';
  css.borderRadius = cornerRadii(style.borderRadius)
    .map((r) => `${r}px`)
    .join(' ');
  css.opacity = style.opacity === undefined ? '' : String(style.opacity);
  css.overflow = style.overflow ?? '';
}

function edges(value: Edges | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.map(length).join(' ') : length(value);
}

function length(value: Length | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'number' ? `${value}px` : value;
}
