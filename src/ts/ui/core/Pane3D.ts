import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("x-pane3d")
export class Pane3D extends LitElement {
  static stlyes = css`
    :host,
    canvas {
      width: 100%;
      height: 100%;
    }
  `;

  constructor() {
    super();
  }

  render() {
    return html`
      <div>
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-pane3d": Pane3D;
  }
}
