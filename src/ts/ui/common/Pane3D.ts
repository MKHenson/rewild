import { html, LitElement, css, PropertyValues } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("x-pane3d")
export class Pane3D extends LitElement {
  static styles = css`
    :host {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: block;
    }
  `;

  private onResizeDelegate: () => void;

  constructor() {
    super();
    this.onResizeDelegate = this.onResize.bind(this);
  }

  get canvas() {
    return this.shadowRoot!.querySelector("canvas")!;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this.onResizeDelegate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.onResizeDelegate);
  }

  render() {
    return html`<canvas></canvas>`;
  }

  updated(changedProps: PropertyValues) {
    this.onResize();
    return super.updated(changedProps);
  }

  private onResize() {
    const canvas = this.shadowRoot?.querySelector("canvas");
    if (canvas) {
      canvas.width = this.clientWidth;
      canvas.height = this.clientHeight;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-pane3d": Pane3D;
  }
}
