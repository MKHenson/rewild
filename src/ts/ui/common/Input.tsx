import { Component, register } from "../Component";
import { theme } from "../theme";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  value?: string;
  placeholder?: string;
  autoFocus?: boolean;
  fullWidth?: boolean;
  onChange?: (val: string) => void;
  onClick?: (e: MouseEvent) => void;
}

@register("x-input")
export class Input extends Component<Props> {
  init() {
    const onClick = (e: MouseEvent) => {
      const elm = e.currentTarget as HTMLInputElement;
      elm.focus();
      elm.setSelectionRange(0, elm.value?.length || null);

      if (this.props.onClick) this.props.onClick(e);
    };

    return () => (
      <div class={`input ${this.props.fullWidth ? "fullwidth" : ""}`}>
        <input
          autofocus={this.props.autoFocus}
          value={this.props.value || ""}
          onclick={onClick}
          placeholder={this.props.placeholder || ""}
          onchange={this.props.onChange ? (e) => this.props.onChange!(e.currentTarget.value) : undefined}
        />
      </div>
    );
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.props.autoFocus) {
      const elm = this.shadow!.querySelector("input")!;
      elm.focus();
      elm.setSelectionRange(0, this.props.value?.length || null);
    }
  }

  getStyle() {
    return css`
      :host > div {
        width: 200px;
      }

      :host > div.fullwidth {
        width: 100%;
      }

      input {
        width: 100%;
        height: 100%;
        padding: 0.6rem;
        outline: none;
        box-sizing: border-box;
        font-family: var(--font-family);
        transition: all 0.25s;
        border: 1px solid transparent;
        border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
        background: ${theme.colors.surface};
        color: ${theme.colors.onSurface};
      }
      input:focus {
        border: 1px solid ${theme.colors.primary400};
        color: ${theme.colors.primary500};
      }
    `;
  }
}
