import { Component, register } from '../Component';
import { theme } from '../theme';

export type ButtonVariant = 'contained' | 'outlined' | 'text' | 'ghost';
export type ButtonColor = 'primary' | 'secondary' | 'error';

interface Props {
  disabled?: boolean;
  variant?: ButtonVariant;
  color?: ButtonColor;
  fullWidth?: boolean;
  /**
   * Toggle state, for buttons that stay pressed (tool pickers, segmented
   * controls in a ButtonGroup). Renders as pressed and exposes aria-pressed.
   * Leave undefined for ordinary action buttons — they get no aria-pressed.
   */
  selected?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
  id?: string;
}

@register('x-button')
export class Button extends Component<Props> {
  init() {
    if (this.props.onClick) this.onclick = this.props.onClick;
    const elm = <slot></slot>;

    return () => {
      this.setAttribute('id', this.props.id || '');
      this.toggleAttribute('fullwidth', this.props.fullWidth || false);
      this.disabled = this._props.disabled || false;
      // Passed through undefined-and-all, so an action button stays a plain
      // button rather than reporting itself as an unpressed toggle.
      this.selected = this._props.selected;
      this.className = `${this.props.class || ''} ${
        this.props.variant || 'contained'
      } ${this.props.color || 'primary'}`;

      return elm;
    };
  }

  set disabled(val: boolean) {
    this._props.disabled = val;
    this.toggleAttribute('disabled', this._props.disabled || false);
  }

  set selected(val: boolean | undefined) {
    this._props.selected = val;
    this.toggleAttribute('selected', val || false);

    // Only a toggle button is a pressable thing; an action button that has
    // never been given a selected state must not claim one.
    if (val === undefined) this.removeAttribute('aria-pressed');
    else this.setAttribute('aria-pressed', val ? 'true' : 'false');
  }

  getStyle() {
    return StyledButtons;
  }
}

const StyledButtons = cssStylesheet(css`
  :host {
    /* Flex, not inline-block: an icon and a label are then laid out and spaced
       by the button itself, instead of each call site nudging them apart. */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    /* Transparent rather than none, so contained and outlined buttons are the
       same size and sit level next to each other in a group. */
    border: 1px solid transparent;
    font-family: var(--font-family);
    font-weight: 500;
    font-size: 14px;
    line-height: 1.25;
    letter-spacing: 0.01em;
    text-align: center;
    user-select: none;
    cursor: pointer;
    /* Quick and eased — a button should read as responding, not animating.
       transform is left out on purpose: the press must land instantly. */
    transition: background-color 0.15s ease, box-shadow 0.15s ease,
      color 0.15s ease, border-color 0.15s ease;
  }
  :host([fullwidth]) {
    display: flex;
  }

  /* Every variant dips on press. Cheap, and it does most of the work of making
     the control feel physical. */
  :host(:active) {
    transform: translateY(1px);
  }

  /* Icons take the button's colour, so they follow it through hover, selected
     and disabled instead of keeping their own muted default. */
  ::slotted(x-icon),
  ::slotted(x-styled-icon) {
    color: inherit;
  }

  :host([disabled]),
  :host([disabled]):hover {
    opacity: 0.65;
    pointer-events: none;
  }
  /* Two soft layers offset straight down — a contact shadow plus a wider
     ambient one. The old single 2px/2px offset shadow fell to the right, which
     reads as a sticker rather than as height. */
  :host(.contained) {
    box-shadow: 0 1px 2px rgb(0 0 0 / 12%), 0 1px 3px rgb(0 0 0 / 8%);
  }
  :host(.contained):hover {
    box-shadow: 0 2px 4px rgb(0 0 0 / 14%), 0 4px 8px rgb(0 0 0 / 8%);
  }
  /* Pressed sits back down on the surface. */
  :host(.contained):active {
    box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
  }
  :host(.contained.primary) {
    background: ${theme?.colors.primary400};
    color: ${theme?.colors.onPrimary400};
  }
  :host(.contained.primary:hover) {
    background: ${theme?.colors.primary500};
    color: ${theme?.colors.onPrimary500};
  }
  :host(.contained.primary:active) {
    background: ${theme?.colors.primary600};
    color: ${theme?.colors.onPrimary600};
  }
  :host(.contained.secondary) {
    background: ${theme?.colors.secondary400};
    color: ${theme?.colors.onSecondary400};
  }
  :host(.contained.secondary:hover) {
    background: ${theme?.colors.secondary500};
    color: ${theme?.colors.onSecondary500};
  }
  :host(.contained.secondary:active) {
    background: ${theme?.colors.secondary600};
    color: ${theme?.colors.onSecondary600};
  }
  :host(.contained.error) {
    background: ${theme?.colors.error400};
    color: ${theme?.colors.onError400};
  }
  :host(.contained.error:hover) {
    background: ${theme?.colors.error500};
    color: ${theme?.colors.onError500};
  }
  :host(.contained.error:active) {
    background: ${theme?.colors.error600};
    color: ${theme?.colors.onError600};
  }
  :host(.outlined),
  :host(.text) {
    background: transparent;
  }
  /* Tinted with the button's own colour rather than a flat grey wash, so a
     primary and an error button hover as themselves. */
  :host(.outlined:hover),
  :host(.text:hover) {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  :host(.outlined:active),
  :host(.text:active) {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
  :host(.outlined.primary) {
    color: ${theme?.colors.primary400};
    border: 1px solid ${theme?.colors.primary400};
  }
  :host(.outlined.secondary) {
    color: ${theme?.colors.secondary400};
    border: 1px solid ${theme?.colors.secondary400};
  }
  :host(.outlined.error) {
    color: ${theme?.colors.error400};
    border: 1px solid ${theme?.colors.error400};
  }
  :host(.text.primary:hover) {
    color: ${theme?.colors.primary400};
  }
  :host(.text.secondary:hover) {
    color: ${theme?.colors.secondary400};
  }
  :host(.text.error:hover) {
    color: ${theme?.colors.error400};
  }

  /* Ghost — no frame, no fill: muted until hovered, and accent-coloured (not
     filled) when selected. For dense tool palettes, where a row of framed
     buttons is more chrome than content. */
  :host(.ghost) {
    background: transparent;
    /* Keeps the base transparent border rather than dropping to none, so a
       ghost button is the same size as the framed ones beside it. */
    color: ${theme?.colors.onSubtle};
  }
  :host(.ghost:hover) {
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: ${theme?.colors.onSurface};
  }
  :host(.ghost:active) {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  /* Selected (toggle) — last so it wins over the hover rules above at equal
     specificity. Contained deepens to the pressed shade; outlined and text
     fill in, which is what reads as "on" in a segmented control. */
  :host([selected].contained.primary) {
    background: ${theme?.colors.primary600};
    color: ${theme?.colors.onPrimary600};
  }
  :host([selected].contained.secondary) {
    background: ${theme?.colors.secondary600};
    color: ${theme?.colors.onSecondary600};
  }
  :host([selected].contained.error) {
    background: ${theme?.colors.error600};
    color: ${theme?.colors.onError600};
  }
  :host([selected].outlined.primary),
  :host([selected].text.primary) {
    background: ${theme?.colors.primary400};
    color: ${theme?.colors.onPrimary400};
    border-color: ${theme?.colors.primary400};
  }
  :host([selected].outlined.secondary),
  :host([selected].text.secondary) {
    background: ${theme?.colors.secondary400};
    color: ${theme?.colors.onSecondary400};
    border-color: ${theme?.colors.secondary400};
  }
  :host([selected].outlined.error),
  :host([selected].text.error) {
    background: ${theme?.colors.error400};
    color: ${theme?.colors.onError400};
    border-color: ${theme?.colors.error400};
  }

  /* Ghost stays unfilled when selected — colour alone carries the state, and
     leaving the background to the rules above keeps the hover wash working. */
  :host([selected].ghost.primary) {
    color: ${theme?.colors.primary400};
  }
  :host([selected].ghost.secondary) {
    color: ${theme?.colors.secondary400};
  }
  :host([selected].ghost.error) {
    color: ${theme?.colors.error400};
  }
`);
