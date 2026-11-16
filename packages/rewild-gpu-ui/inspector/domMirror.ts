import { cornerRadii, Length, UINode, UIStyle } from '../lib';

/** Builds DOM elements with the same styles as a surface's tree. */
export function mirrorTree(root: UINode): HTMLElement {
  const element = mirrorNode(root);
  element.style.position = 'relative';
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
  css.position = style.position ?? 'relative';
  css.top = length(style.top);
  css.right = length(style.right);
  css.bottom = length(style.bottom);
  css.left = length(style.left);
  css.width = length(style.width);
  css.height = length(style.height);
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

function length(value: Length | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'number' ? `${value}px` : value;
}
