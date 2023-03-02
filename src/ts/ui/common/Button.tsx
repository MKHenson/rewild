import { Component, register } from "../Component";
import { theme } from "../theme";

export type ButtonVariant = "contained" | "outlined" | "text";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  disabled?: boolean;
  variant?: ButtonVariant;
  color?: ButtonColor;
  fullWidth?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
}

@register("x-button")
export class Button extends Component<Props> {
  init() {
    return () => {
      this.toggleAttribute("fullwidth", this.props.fullWidth);
      return (
        <button
          disabled={this.props.disabled}
          onclick={this.props.onClick}
          class={`${this.props.class || ""} ${this.props.variant || "contained"} ${this.props.color || "primary"} ${
            this.props.fullWidth ? "fullwidth" : ""
          }`}
        >
          {this.props.children}
        </button>
      );
    };
  }

  getStyle() {
    return StyledButtons;
  }
}

const StyledButtons = cssStylesheet(css`
  :host {
    display: inline-block;
  }
  :host([fullwidth]) {
    display: block;
  }

  :host button {
    padding: 0.5rem 1rem;
    border-radius: 5px;
    border: none;
    text-transform: uppercase;
    font-weight: 500;
    font-family: var(--font-family);
    font-weight: 400;
    display: inline-block;
    user-select: none;
    cursor: pointer;
    transition: box-shadow 0.25s, background-color 0.25s;
  }
  :host button.fullwidth {
    width: 100%;
    display: block;
  }

  :host button > * {
    vertical-align: middle;
  }

  :host button[disabled],
  :host button[disabled]:hover {
    opacity: 0.65;
    pointer-events: none;
  }
  :host button.contained {
    box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
  }
  :host button.contained:hover {
    box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
  }
  :host button.contained.primary {
    background: ${theme?.colors.primary400};
    color: ${theme?.colors.onPrimary400};
  }
  :host button.contained.primary:hover {
    background: ${theme?.colors.primary500};
    color: ${theme?.colors.onPrimary500};
  }
  :host button.contained.primary:active {
    background: ${theme?.colors.primary600};
    color: ${theme?.colors.onPrimary600};
  }
  :host button.contained.secondary {
    background: ${theme?.colors.secondary400};
    color: ${theme?.colors.onSecondary400};
  }
  :host button.contained.secondary:hover {
    background: ${theme?.colors.secondary500};
    color: ${theme?.colors.onSecondary500};
  }
  :host button.contained.secondary:active {
    background: ${theme?.colors.secondary600};
    color: ${theme?.colors.onSecondary600};
  }
  :host button.contained.error {
    background: ${theme?.colors.error400};
    color: ${theme?.colors.onError400};
  }
  :host button.contained.error:hover {
    background: ${theme?.colors.error500};
    color: ${theme?.colors.onError500};
  }
  :host button.contained.error:active {
    background: ${theme?.colors.error600};
    color: ${theme?.colors.onError600};
  }
  :host button.outlined,
  :host button.text {
    background: transparent;
  }
  :host button.outlined:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  :host button.outlined:active {
    background: rgba(0, 0, 0, 0.1);
  }
  :host button.text:hover {
    font-weight: 500;
  }
  :host button.outlined.primary {
    color: ${theme?.colors.primary400};
    border: 1px solid ${theme?.colors.primary400};
  }
  :host button.outlined.secondary {
    color: ${theme?.colors.secondary400};
    border: 1px solid ${theme?.colors.secondary400};
  }
  :host button.outlined.error {
    color: ${theme?.colors.error400};
    border: 1px solid ${theme?.colors.error400};
  }
  :host button.text.primary:hover {
    color: ${theme?.colors.primary400};
  }
  :host button.text.secondary:hover {
    color: ${theme?.colors.secondary400};
  }
  :host button.text.error:hover {
    color: ${theme?.colors.error400};
  }
`);
