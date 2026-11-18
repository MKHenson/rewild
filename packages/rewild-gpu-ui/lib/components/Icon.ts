import type { UIIconName } from '../iconNames';
import { UIColor, UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface IconOptions {
  icon: UIIconName;
  /** The width and height in CSS pixels. Defaults to 24, lucide's own size. */
  size?: number;
  /** The tint. Defaults to the text colour that passes down to the icon. */
  color?: UIColor;
  /** Names the node in debug output. Defaults to `icon`. */
  name?: string;
  style?: UIStyle;
}

/**
 * One lucide icon from the icon atlas, in a square box. It tints like text,
 * from its `color` or the one that passes down to it.
 */
export class Icon implements UIComponent {
  readonly node: UINode;

  constructor(options: IconOptions) {
    const size = options.size ?? 24;
    this.node = new UINode({
      name: options.name ?? 'icon',
      icon: options.icon,
      style: {
        width: size,
        height: size,
        flexShrink: 0,
        ...(options.color && { color: options.color }),
        ...options.style,
      },
    });
  }

  get icon(): UIIconName {
    return this.node.icon!;
  }

  set icon(name: UIIconName) {
    this.node.icon = name;
  }

  get size(): number {
    return this.node.style.width as number;
  }

  set size(size: number) {
    this.node.style.width = size;
    this.node.style.height = size;
  }
}
