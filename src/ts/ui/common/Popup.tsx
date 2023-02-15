import { Component, register } from "../Component";
import { theme } from "../theme";

interface Props {
  open: boolean;
  withBackground?: boolean;
  onClose?: () => void;
}

@register("x-popup")
export class Popup extends Component<Props> {
  constructor() {
    super({ props: { withBackground: true } });
  }

  init() {
    return () => {
      const handleClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains("wrapper")) {
          this.props.onClose && this.props.onClose();
        }
      };

      this.toggleAttribute("open", this.props.open);

      return (
        <div
          class={`wrapper popup ${this.props.open ? "visible" : ""} ${
            this.props.withBackground ? "withBackground" : ""
          }`}
          onclick={handleClick}
        >
          <div class="modal">
            <slot></slot>
          </div>
        </div>
      );
    };
  }

  css() {
    return css`
      :host {
        display: none;
      }
      :host([open]) {
        display: initial;
      }

      :host,
      :host > div {
        position: fixed;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
      }

      :host > div {
        pointer-events: none;
        background: none;
        opacity: 0;
        visibility: hidden;
        transform: scale(1.1);
        transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
        z-index: 1;
      }

      :host > .withBackground {
        pointer-events: all;
        background: rgba(0, 0, 0, 0.5);
      }

      :host > .visible {
        opacity: 1;
        visibility: visible;
        transform: scale(1);
        transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;
      }

      .modal {
        pointer-events: all;
        padding: 1rem;
        background-color: ${theme?.colors.surface};
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 5px;
        min-width: 300px;
        box-shadow: 2px 2px 2px 4px rgba(0, 0, 0, 0.1);
      }
    `;
  }
}
