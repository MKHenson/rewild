import { Component, register } from '../Component';

interface Props {
  onCanvasReady: (canvas: Pane3D) => void;
  onResize?: (canvas: Pane3D) => void;
}

@register('x-pane-3d')
export class Pane3D extends Component<Props> {
  onResizeDelegate: (e?: UIEvent) => void;
  // observer: ResizeObserver;

  init() {
    this.onResizeDelegate = this.onResize.bind(this);

    this.onMount = () => {
      window.addEventListener('resize', this.onResizeDelegate);
      this.onResizeDelegate();

      const canvas = this.canvas();

      if (canvas) this.props.onCanvasReady(this);
    };

    this.onCleanup = () => {
      window.removeEventListener('resize', this.onResizeDelegate);
    };

    const element = (
      <div>
        <canvas></canvas>
      </div>
    );
    return () => element;
  }

  private onResize(e?: UIEvent) {
    const canvas = this.shadow!.querySelector('canvas')!;
    canvas.width = this.clientWidth;
    canvas.height = this.clientHeight;
    this.props.onResize?.(this);
  }

  canvas() {
    const canvas = this.shadow!.querySelector('canvas');
    return canvas;
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
