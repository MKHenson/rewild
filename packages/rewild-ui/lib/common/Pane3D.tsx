import { Component, register } from '../Component';

interface Props {
  onCanvasReady: (canvas: Pane3D) => void;
  onResize?: (canvas: Pane3D) => void;
}

/**
 * A canvas that fills its host, with a backing size in device pixels. It sizes
 * again when the host resizes or the device pixel ratio changes, such as when
 * the window moves to another screen.
 */
@register('x-pane-3d')
export class Pane3D extends Component<Props> {
  // True once the browser gives exact device pixel sizes. Safari does not.
  private exactPixels = false;
  private stopWatchingRatio = () => {};

  init() {
    this.onMount = () => {
      this.resize();
      this.watchRatio();

      const canvas = this.canvas();

      if (canvas) this.props.onCanvasReady(this);
    };

    this.onCleanup = () => {
      this.stopWatchingRatio();
    };

    const canvas = (<canvas></canvas>) as HTMLCanvasElement;
    const element = <div>{canvas}</div>;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== canvas) continue;
        const device = entry.devicePixelContentBoxSize?.[0];
        if (device) this.exactPixels = true;
        this.resize(device?.inlineSize, device?.blockSize);
      }
    });

    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(canvas);
    }

    return () => element;
  }

  /** Sizes the backing texture to the given device pixels, or else to the CSS size times the ratio. */
  private resize(width?: number, height?: number) {
    const canvas = this.canvas();
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    width ??= Math.round(this.clientWidth * ratio);
    height ??= Math.round(this.clientHeight * ratio);
    width = Math.max(1, width);
    height = Math.max(1, height);
    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    this.props.onResize?.(this);
  }

  /** The ratio changes when the window moves to another screen or zooms. */
  private watchRatio() {
    this.stopWatchingRatio();
    if (!window.matchMedia) return;
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      this.watchRatio();
      // An exact device pixel size also changes with the ratio, and the
      // resize observer reports it.
      if (!this.exactPixels) this.resize();
    };
    query.addEventListener('change', onChange, { once: true });
    this.stopWatchingRatio = () =>
      query.removeEventListener('change', onChange);
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
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
`);
