import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

@customElement("x-button")
export class Button extends LitElement {
  static styles = css`
    button {
      padding: 0.5rem 1rem;
      border-radius: 5px;
      border: none;
      text-transform: uppercase;
      font-weight: 500;
      font-family: var(--font-family);
      font-weight: 400;
      cursor: pointer;
      user-select: none;
      transition: box-shadow 0.25s, background-color 0.25s;
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
      background: var(--primary-400);
      color: var(--on-primary-400);
    }
    button.contained.primary:hover {
      background: var(--primary-500);
      color: var(--on-primary-500);
    }
    button.contained.primary:active {
      background: var(--primary-600);
      color: var(--on-primary-600);
    }

    button.contained.secondary {
      background: var(--secondary-400);
      color: var(--on-secondary-400);
    }
    button.contained.secondary:hover {
      background: var(--secondary-500);
      color: var(--on-secondary-500);
    }
    button.contained.secondary:active {
      background: var(--secondary-600);
      color: var(--on-secondary-600);
    }

    button.contained.error {
      background: var(--error-400);
      color: var(--on-errory-400);
    }
    button.contained.error:hover {
      background: var(--error-500);
      color: var(--on-error-500);
    }
    button.contained.error:active {
      background: var(--error-600);
      color: var(--on-error-600);
    }

    button.outlined {
      background: transparent;
    }
    button.outlined:hover {
      background: rgba(0, 0, 0, 0.05);
    }
    button.outlined:active {
      background: rgba(0, 0, 0, 0.1);
    }

    button.outlined.primary {
      color: var(--primary-400);
      border: 1px solid var(--primary-400);
    }
    button.outlined.secondary {
      color: var(--secondary-400);
      border: 1px solid var(--secondary-400);
    }
    button.outlined.error {
      color: var(--errory-400);
      border: 1px solid var(--errory-400);
    }
  `;

  // Declare reactive properties
  @property({ type: Boolean })
  disabled?: boolean = false;

  @property()
  color?: ButtonColor = "primary";

  @property()
  variant?: ButtonVariant = "contained";

  constructor() {
    super();
    this.addEventListener("click", this.onClick.bind(this));
  }

  render() {
    return html`<button ?disabled=${this.disabled} class="${this.color} ${this.variant}">
      <slot></slot>
    </button>`;
  }

  private onClick(e: MouseEvent) {
    if (this.disabled) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-button": Button;
  }
}
