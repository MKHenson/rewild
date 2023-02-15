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
          <slot></slot>
        </button>
      );
    };
  }

  css() {
    return css`
      :host {
        display: inline-block;
      }
      :host([fullwidth]) {
        display: block;
      }

      button {
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
      button.fullwidth {
        width: 100%;
        display: block;
      }

      button > * {
        vertical-align: middle;
      }

      button[disabled],
      button[disabled]:hover {
        opacity: 0.65;
        pointer-events: none;
      }
      button.contained {
        box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
      }
      button.contained:hover {
        box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
      }
      button.contained.primary {
        background: ${theme?.colors.primary400};
        color: ${theme?.colors.onPrimary400};
      }
      button.contained.primary:hover {
        background: ${theme?.colors.primary500};
        color: ${theme?.colors.onPrimary500};
      }
      button.contained.primary:active {
        background: ${theme?.colors.primary600};
        color: ${theme?.colors.onPrimary600};
      }
      button.contained.secondary {
        background: ${theme?.colors.secondary400};
        color: ${theme?.colors.onSecondary400};
      }
      button.contained.secondary:hover {
        background: ${theme?.colors.secondary500};
        color: ${theme?.colors.onSecondary500};
      }
      button.contained.secondary:active {
        background: ${theme?.colors.secondary600};
        color: ${theme?.colors.onSecondary600};
      }
      button.contained.error {
        background: ${theme?.colors.error400};
        color: ${theme?.colors.onError400};
      }
      button.contained.error:hover {
        background: ${theme?.colors.error500};
        color: ${theme?.colors.onError500};
      }
      button.contained.error:active {
        background: ${theme?.colors.error600};
        color: ${theme?.colors.onError600};
      }
      button.outlined,
      button.text {
        background: transparent;
      }
      button.outlined:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      button.outlined:active {
        background: rgba(0, 0, 0, 0.1);
      }
      button.text:hover {
        font-weight: 500;
      }
      button.outlined.primary {
        color: ${theme?.colors.primary400};
        border: 1px solid ${theme?.colors.primary400};
      }
      button.outlined.secondary {
        color: ${theme?.colors.secondary400};
        border: 1px solid ${theme?.colors.secondary400};
      }
      button.outlined.error {
        color: ${theme?.colors.error400};
        border: 1px solid ${theme?.colors.error400};
      }
      button.text.primary:hover {
        color: ${theme?.colors.primary400};
      }
      button.text.secondary:hover {
        color: ${theme?.colors.secondary400};
      }
      button.text.error:hover {
        color: ${theme?.colors.error400};
      }
    `;
  }
}
