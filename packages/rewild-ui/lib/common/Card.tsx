import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  pushed?: boolean;
  raised?: boolean;
  button?: boolean;
  stretched?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
}

@register('x-card')
export class Card extends Component<Props> {
  init() {
    const elm = <slot></slot>;
    return () => {
      this.toggleAttribute('button', this.props.button || false);
      this.toggleAttribute('disabled', this.props.disabled || false);
      this.classList.toggle('pushed', this.props.pushed || false);
      this.classList.toggle('raised', this.props.raised || false);
      this.toggleAttribute('stretched', this.props.stretched || false);
      if (!this.props.disabled && this.props.onClick)
        this.onclick = this.props.onClick;
      return elm;
    };
  }

  getStyle() {
    return StyledCard;
  }
}

const StyledCard = cssStylesheet(css`
  :host {
    display: block;
    padding: 0.5rem 1rem;
    background-color: ${theme?.colors.surface};
    box-sizing: border-box;
    overflow: auto;
  }

  :host([stretched]) {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  :host([button]) {
    cursor: pointer;
  }

  :host([disabled]) {
    pointer-events: none;
    opacity: 0.5;
  }

  :host(.raised) {
    box-shadow: ${theme?.colors.shadowShort1};
  }
  :host(.raised):hover {
    box-shadow: ${theme?.colors.shadowShort2};
  }
  :host(.pushed.raised) {
    box-shadow: ${theme?.colors.shadowShort1},
      inset 0 0 0px 2px ${theme?.colors.primary400};
  }
`);
