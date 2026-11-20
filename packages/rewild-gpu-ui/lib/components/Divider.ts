import { UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface DividerOptions {
  /** Names the node in debug output. Defaults to `divider`. */
  name?: string;
  style?: UIStyle;
}

/** A 1 px line across its parent, in `onSurfaceBorder`, as the DOM's divider. */
export class Divider implements UIComponent {
  readonly node: UINode;

  constructor(options: DividerOptions = {}) {
    this.node = new UINode({
      name: options.name ?? 'divider',
      style: {
        alignSelf: 'stretch',
        height: 1,
        flexShrink: 0,
        backgroundColor: 'onSurfaceBorder',
        ...options.style,
      },
    });
  }
}
