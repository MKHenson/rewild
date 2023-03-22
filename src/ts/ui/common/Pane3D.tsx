import { Component, register } from "../Component";

interface Props {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}

@register("x-pane-3d")
export class Pane3D extends Component<Props> {
  onResizeDelegate: (e?: UIEvent) => void;

  init() {
    this.onResizeDelegate = this.onResize.bind(this);

    this.onMount = () => {
      window.addEventListener("resize", this.onResizeDelegate);
      this.onResizeDelegate();

      const canvas = this.shadow!.querySelector("canvas")!;
      if (canvas) this.props.onCanvasReady(canvas);
    };

    this.onCleanup = () => {
      window.removeEventListener("resize", this.onResizeDelegate);
    };

    return () => (
      <div>
        <canvas></canvas>
      </div>
    );
  }

  private onResize(e?: UIEvent) {
    const canvas = this.shadow!.querySelector("canvas")!;
    canvas.width = this.clientWidth;
    canvas.height = this.clientHeight;
  }

  getStyle() {
    return StyledPane3D;
  }
}

const StyledPane3D = cssStylesheet(css`
  :host,
  :host > div {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: block;
  }
`);
