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
  constructor() {
    super({ useShadow: false });
  }

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
    return css`
      x-button {
        display: inline-block;
      }
      x-button[fullwidth] {
        display: block;
      }

      x-button button {
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
      x-button button.fullwidth {
        width: 100%;
        display: block;
      }

      x-button button > * {
        vertical-align: middle;
      }

      x-button button[disabled],
      x-button button[disabled]:hover {
        opacity: 0.65;
        pointer-events: none;
      }
      x-button button.contained {
        box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
      }
      x-button button.contained:hover {
        box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
      }
      x-button button.contained.primary {
        background: ${theme?.colors.primary400};
        color: ${theme?.colors.onPrimary400};
      }
      x-button button.contained.primary:hover {
        background: ${theme?.colors.primary500};
        color: ${theme?.colors.onPrimary500};
      }
      x-button button.contained.primary:active {
        background: ${theme?.colors.primary600};
        color: ${theme?.colors.onPrimary600};
      }
      x-button button.contained.secondary {
        background: ${theme?.colors.secondary400};
        color: ${theme?.colors.onSecondary400};
      }
      x-button button.contained.secondary:hover {
        background: ${theme?.colors.secondary500};
        color: ${theme?.colors.onSecondary500};
      }
      x-button button.contained.secondary:active {
        background: ${theme?.colors.secondary600};
        color: ${theme?.colors.onSecondary600};
      }
      x-button button.contained.error {
        background: ${theme?.colors.error400};
        color: ${theme?.colors.onError400};
      }
      x-button button.contained.error:hover {
        background: ${theme?.colors.error500};
        color: ${theme?.colors.onError500};
      }
      x-button button.contained.error:active {
        background: ${theme?.colors.error600};
        color: ${theme?.colors.onError600};
      }
      x-button button.outlined,
      x-button button.text {
        background: transparent;
      }
      x-button button.outlined:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      x-button button.outlined:active {
        background: rgba(0, 0, 0, 0.1);
      }
      x-button button.text:hover {
        font-weight: 500;
      }
      x-button button.outlined.primary {
        color: ${theme?.colors.primary400};
        border: 1px solid ${theme?.colors.primary400};
      }
      x-button button.outlined.secondary {
        color: ${theme?.colors.secondary400};
        border: 1px solid ${theme?.colors.secondary400};
      }
      x-button button.outlined.error {
        color: ${theme?.colors.error400};
        border: 1px solid ${theme?.colors.error400};
      }
      x-button button.text.primary:hover {
        color: ${theme?.colors.primary400};
      }
      x-button button.text.secondary:hover {
        color: ${theme?.colors.secondary400};
      }
      x-button button.text.error:hover {
        color: ${theme?.colors.error400};
      }
    `;
  }
}
