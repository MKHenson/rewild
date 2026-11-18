import { UIStyle } from '../style';
import { UIChild, UIComponent, UINode } from '../UINode';

/** The DOM's spacing scale, `theme.space` in rewild-ui, in CSS pixels. */
export const SPACE = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

export type UISpace = keyof typeof SPACE;

export interface StackOptions {
  /** Defaults to `column`. */
  direction?: 'column' | 'row';
  /** A step of the spacing scale. Defaults to `m`. */
  gap?: UISpace;
  children?: UIChild[];
  style?: UIStyle;
}

/** A flex column or row, with a gap from the spacing scale. */
export class Stack implements UIComponent {
  readonly node: UINode;

  constructor(options: StackOptions = {}) {
    this.node = new UINode({
      style: {
        flexDirection: options.direction ?? 'column',
        gap: SPACE[options.gap ?? 'm'],
        ...options.style,
      },
    });
    if (options.children) this.node.append(...options.children);
  }

  append(...children: UIChild[]): void {
    this.node.append(...children);
  }
}
