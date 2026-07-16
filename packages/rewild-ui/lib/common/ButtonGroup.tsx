import { Component, register } from '../Component';

interface Props {
  class?: string;
  /** Stretch to the container width; children share it via `flex: 1`. */
  fullWidth?: boolean;
}

@register('x-button-group')
export class ButtonGroup extends Component<Props> {
  init() {
    const elm = (
      <div>
        <slot></slot>
      </div>
    );

    return () => {
      this.toggleAttribute('fullwidth', this.props.fullWidth || false);
      this.className = this.props.class
        ? `${this.props.class} button-group`
        : 'button-group';
      return elm;
    };
  }

  getStyle() {
    return StyledGroup;
  }
}

const StyledGroup = cssStylesheet(css`
  :host {
    display: inline-block;
  }

  :host([fullwidth]) {
    display: block;
  }

  div {
    display: inline-flex;
  }

  :host([fullwidth]) div {
    display: flex;
    width: 100%;
  }

  /* Buttons are slotted light-DOM children, so ::slotted() is the only way to
     reach them from here — a plain \`x-button\` selector in this stylesheet
     matches nothing. Joining the corners is what makes a group read as one
     control; the -1px pulls adjacent outlines onto a single shared divider. */
  ::slotted(x-button:not(:last-of-type)) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  ::slotted(x-button:not(:first-of-type)) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
  }
`);
