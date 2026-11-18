import { UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

export interface LabelOptions {
  text: string;
  /** Names the node in debug output. Defaults to `label`. */
  name?: string;
  style?: UIStyle;
}

/** Text. The text sizes the label, and wraps to the width it gets. */
export class Label implements UIComponent {
  readonly node: UINode;

  constructor(options: LabelOptions) {
    this.node = new UINode({
      name: options.name ?? 'label',
      text: options.text,
      style: options.style,
    });
  }

  get text(): string {
    return this.node.text ?? '';
  }

  /** Lays out again. */
  set text(text: string) {
    this.node.text = text;
  }
}
