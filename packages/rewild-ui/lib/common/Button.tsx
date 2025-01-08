import { Component, register } from '../Component';
import { theme } from '../theme';

export type ButtonVariant = 'contained' | 'outlined' | 'text';
export type ButtonColor = 'primary' | 'secondary' | 'error';

interface Props {
  disabled?: boolean;
  variant?: ButtonVariant;
  color?: ButtonColor;
  fullWidth?: boolean;
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
      this.toggleAttribute('disabled', this.props.disabled || false);
      this.className = `${this.props.class || ''} ${
        this.props.variant || 'contained'
      } ${this.props.color || 'primary'}`;

      return elm;
    };
  }

  set disabled(val: boolean) {
    this.props = { ...this.props, disabled: val };
  }

  getStyle() {
    return StyledButtons;
  }
}

const StyledButtons = cssStylesheet(css`
  :host {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 5px;
    border: none;
    text-transform: uppercase;
    font-weight: 500;
    font-family: var(--font-family);
    font-weight: 400;
    font-size: 14px;
    display: inline-block;
    text-align: center;
    user-select: none;
    cursor: pointer;
    transition: box-shadow 0.25s, background-color 0.25s;
  }
  :host([fullwidth]) {
    display: block;
  }

  :host > * {
    vertical-align: middle;
  }

  :host([disabled]),
  :host([disabled]):hover {
    opacity: 0.65;
    pointer-events: none;
  }
  :host(.contained) {
    box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
  }
  :host(.contained):hover {
    box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
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
  :host(.outlined:hover) {
    background: rgba(0, 0, 0, 0.05);
  }
  :host(.outlined:active) {
    background: rgba(0, 0, 0, 0.1);
  }
  :host(.text:hover) {
    font-weight: 500;
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
`);
