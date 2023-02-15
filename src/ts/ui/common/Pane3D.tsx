import { Component, register } from "../Component";

interface Props {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}

@register("x-pane-3d")
export class Pane3D extends Component<Props> {
  onResizeDelegate: (e?: UIEvent) => void;

  init() {
    this.onResizeDelegate = this.onResize.bind(this);

    return () => {
      return (
        <div>
          <canvas></canvas>
        </div>
      );
    };
  }

  private onResize(e?: UIEvent) {
    const canvas = this.shadow!.querySelector("canvas")!;
    canvas.width = this.clientWidth;
    canvas.height = this.clientHeight;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this.onResizeDelegate);
    this.onResizeDelegate();

    const canvas = this.shadow!.querySelector("canvas")!;
    if (canvas) this.props.onCanvasReady(canvas);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.onResizeDelegate);
  }

  css() {
    return css`
      :host,
      :host > div {
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: block;
      }
    `;
  }
}
