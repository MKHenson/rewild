import type { UIIconName } from '../iconNames';
import { UIBoxShadow, UIColor, UIStyle } from '../style';
import type { UIThemeColor } from '../theme';
import { UIComponent, UINode } from '../UINode';
import { Icon } from './Icon';
import { Label } from './Label';

export type ButtonColor = 'primary' | 'secondary' | 'error';

/** `contained` fills the button. `text` has no fill until hover, as the DOM's text button. */
export type ButtonVariant = 'contained' | 'text';

type ButtonState = 'rest' | 'hover' | 'press';

/** The fill and the text colour of each state, as the DOM's contained button. */
const COLORS: Record<
  ButtonColor,
  Record<ButtonState, [UIThemeColor, UIThemeColor]>
> = {
  primary: {
    rest: ['primary400', 'onPrimary400'],
    hover: ['primary500', 'onPrimary500'],
    press: ['primary600', 'onPrimary600'],
  },
  secondary: {
    rest: ['secondary400', 'onSecondary400'],
    hover: ['secondary500', 'onSecondary500'],
    press: ['secondary600', 'onSecondary600'],
  },
  error: {
    rest: ['error400', 'onError400'],
    hover: ['error500', 'onError500'],
    press: ['error600', 'onError600'],
  },
};

/**
 * A line of light on the top edge, a contact shadow and an ambient shadow.
 * Hover lifts the button, and a press sets it back down.
 */
const SHADOWS: Record<ButtonState, UIBoxShadow[]> = {
  rest: [
    { inset: true, y: 1, color: '#ffffff2e' },
    { y: 1, blur: 2, color: '#0000001f' },
    { y: 1, blur: 3, color: '#00000014' },
  ],
  hover: [
    { inset: true, y: 1, color: '#ffffff38' },
    { y: 2, blur: 4, color: '#00000024' },
    { y: 4, blur: 8, color: '#00000014' },
  ],
  press: [
    { inset: true, y: 1, color: '#ffffff1a' },
    { y: 1, blur: 2, color: '#00000024' },
  ],
};

/** The colour a text button takes on hover and press, as the DOM's text button. */
const TEXT_COLORS: Record<ButtonColor, UIThemeColor> = {
  primary: 'primaryText',
  secondary: 'secondary400',
  error: 'error400',
};

/** A text button's wash, as a share of its colour: `currentColor` at 8 % and 14 % in the DOM. */
const TEXT_WASH: Record<ButtonState, number> = {
  rest: 0,
  hover: 0.08,
  press: 0.14,
};

/** A press moves the button down 1 px, with no transition. */
const PRESSED = { y: 1 };

export interface ButtonOptions {
  label: string;
  /** Drawn before the label, at 16 px. */
  icon?: UIIconName;
  /** Defaults to `primary`. */
  color?: ButtonColor;
  /** Defaults to `contained`. */
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  /** Names the node in debug output. Defaults to `button`. */
  name?: string;
  style?: UIStyle;
}

/**
 * The DOM's contained or text button: a label and an optional icon. A
 * contained button is on a theme colour, and lights on hover and darkens on
 * a press. A text button is the surface's text colour with no fill, and
 * takes its colour and a light wash of it on hover. Both dip on a press and
 * take focus.
 * A click, Enter or the gamepad's A calls `onClick`.
 */
export class Button implements UIComponent {
  readonly node: UINode;
  onClick: (() => void) | null;
  private readonly label: Label;
  private color: ButtonColor;
  private variant: ButtonVariant;
  private hovered = false;
  private pressed = false;
  private _disabled = false;

  constructor(options: ButtonOptions) {
    this.color = options.color ?? 'primary';
    this.variant = options.variant ?? 'contained';
    this.onClick = options.onClick ?? null;
    this.label = new Label({ text: options.label });
    this.node = new UINode({
      name: options.name ?? 'button',
      style: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        padding: [0, 12, 0, 12],
        borderRadius: 4,
        fontSize: 14,
        lineHeight: 1.25,
        textAlign: 'center',
        transition: [
          { property: 'backgroundColor', duration: 150 },
          { property: 'color', duration: 150 },
        ],
        ...options.style,
      },
    });
    if (options.icon)
      this.node.append(new Icon({ icon: options.icon, size: 16 }));
    this.node.append(this.label);

    this.node.on('pointerenter', () => {
      this.hovered = true;
      this.paint();
    });
    this.node.on('pointerleave', () => {
      this.hovered = false;
      this.pressed = false;
      this.paint();
    });
    this.node.on('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pressed = true;
      this.paint();
    });
    const release = () => {
      this.pressed = false;
      this.paint();
    };
    this.node.on('pointerup', release);
    this.node.on('pointercancel', release);
    this.node.on('click', () => {
      if (!this._disabled) this.onClick?.();
    });
    this.disabled = options.disabled ?? false;
    this.paint();
  }

  get text(): string {
    return this.label.text;
  }

  set text(text: string) {
    this.label.text = text;
  }

  /** A disabled button fades, and takes no pointer input and no focus. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    this._disabled = value;
    const style = this.node.style;
    style.opacity = value ? 0.65 : undefined;
    style.pointerEvents = value ? 'none' : undefined;
    style.focusable = !value;
    if (value) {
      this.node.blur();
      this.hovered = false;
      this.pressed = false;
      this.paint();
    }
  }

  private paint(): void {
    const state = this.pressed ? 'press' : this.hovered ? 'hover' : 'rest';
    const style = this.node.style;
    if (this.variant === 'text') {
      const color = TEXT_COLORS[this.color];
      // The wash is the colour at 0 % at rest, so it fades in on hover.
      const fill: UIColor = { theme: color, alpha: TEXT_WASH[state] };
      style.backgroundColor = fill;
      style.color = state === 'rest' ? 'onSurface' : color;
      style.boxShadow = undefined;
    } else {
      const [fill, text] = COLORS[this.color][state];
      style.backgroundColor = fill;
      style.color = text;
      style.boxShadow = SHADOWS[state];
    }
    style.transform = this.pressed ? PRESSED : undefined;
  }
}
