import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("x-modal")
export class Modal extends LitElement {
  static styles = css`
    :host {
    }
    .wrapper {
      position: fixed;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      opacity: 0;
      visibility: hidden;
      transform: scale(1.1);
      transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
      z-index: 1;
    }
    .visible {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
      transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;
    }
    .modal {
      font-family: Helvetica;
      font-size: 14px;
      padding: 1rem;
      background-color: var(--surface);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 2px;
      min-width: 300px;
    }
    .title {
      font-size: 18px;
    }
    .button-container {
      text-align: right;
    }
    .button-container > x-button {
      margin: 0 0 0 4px;
    }
    .content {
      padding: 0.5rem 0;
    }
  `;

  // Declare reactive properties
  @property({ type: Boolean })
  open?: boolean = false;

  @property({ type: Boolean })
  hideConfirmButtons?: boolean = false;

  // Render the UI as a function of component state
  render() {
    const wrapperClass = this.open ? "wrapper visible" : "wrapper";
    return html`
      <div class="${wrapperClass}">
        <div class="modal">
          <span class="title">${this.title}</span>
          <div class="content">
            <slot></slot>
          </div>
          ${this.hideConfirmButtons
            ? ""
            : html`<div class="button-container">
                <x-button variant="outlined" @click="${this.onCancel}" class="cancel">Cancel</x-button>
                <x-button @click="${this.onOk}" class="ok">Okay</x-button>
              </div>`}
        </div>
      </div>
    `;
  }

  onCancel(e: MouseEvent) {
    this.dispatchEvent(new CustomEvent("cancel"));
    this.removeAttribute("open");
  }

  onOk(e: MouseEvent) {
    this.dispatchEvent(new CustomEvent("ok"));
    this.removeAttribute("open");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-modal": Modal;
  }
}
