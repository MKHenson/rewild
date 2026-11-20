import type { UIIconName } from '../iconNames';
import { UIStyle } from '../style';
import type { UIThemeColor } from '../theme';
import { UIComponent, UINode } from '../UINode';
import { Icon } from './Icon';
import { Label } from './Label';

export type InfoBoxVariant = 'info' | 'error' | 'warning';

export interface InfoBoxOptions {
  /** Defaults to `info`. */
  variant?: InfoBoxVariant;
  /** A bold line over the text. */
  title?: string;
  text: string;
  /** Names the node in debug output. Defaults to `infobox`. */
  name?: string;
  style?: UIStyle;
}

/** The icon, the icon's colour and the bar's colour of each variant. */
const VARIANTS: Record<
  InfoBoxVariant,
  { icon: UIIconName; color: UIThemeColor; bar: UIThemeColor }
> = {
  info: { icon: 'info', color: 'primaryText', bar: 'primary400' },
  error: { icon: 'circle-alert', color: 'error400', bar: 'error400' },
  warning: { icon: 'triangle-alert', color: 'warning400', bar: 'warning400' },
};

/** The width of the bar down the left edge. */
const BAR = 4;

/**
 * A box of help text: a neutral panel with an icon, and the variant's colour
 * as a bar down the left edge. The text wraps to the box.
 */
export class InfoBox implements UIComponent {
  readonly node: UINode;
  private readonly label: Label;

  constructor(options: InfoBoxOptions) {
    const variant = VARIANTS[options.variant ?? 'info'];
    this.label = new Label({ text: options.text });
    const content = new UINode({
      name: 'content',
      style: { flexDirection: 'column', flexGrow: 1, minWidth: 0, gap: 4 },
    });
    if (options.title)
      content.append(
        new Label({ text: options.title, style: { fontWeight: 'bold' } })
      );
    content.append(this.label);

    this.node = new UINode({
      name: options.name ?? 'infobox',
      style: {
        alignItems: 'flex-start',
        gap: 12,
        padding: [8, 12, 8, 12 + BAR],
        fontSize: 14,
        lineHeight: 1.4,
        color: 'onSurface',
        backgroundColor: 'subtle400',
        // The bar is an inset shadow, so it adds no width.
        boxShadow: { inset: true, x: BAR, color: variant.bar },
        ...options.style,
      },
    });
    this.node.append(
      new Icon({ icon: variant.icon, size: 20, color: variant.color }),
      content
    );
  }

  get text(): string {
    return this.label.text;
  }

  set text(text: string) {
    this.label.text = text;
  }
}
