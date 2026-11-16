import { canvasPixelSize } from './canvasSize';

/**
 * A canvas that the GPU UI draws into, on a device it does not own. Layout
 * works in CSS pixels, and the backing texture is sized by the pixel ratio.
 */
export class UICanvas {
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  cssWidth = 0;
  cssHeight = 0;
  pixelRatio = 1;

  constructor(readonly device: GPUDevice, readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context is not available');
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
  }

  /** Returns true when the backing size changed. */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): boolean {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.pixelRatio = pixelRatio;
    const { width, height } = canvasPixelSize(cssWidth, cssHeight, pixelRatio);
    if (this.canvas.width === width && this.canvas.height === height)
      return false;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  dispose(): void {
    this.context.unconfigure();
  }
}

/** Requests a bare device, for pages that run the GPU UI without the renderer. */
export async function requestUIDevice(): Promise<GPUDevice> {
  if (!navigator.gpu) throw new Error('WebGPU is not supported');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter found');
  return adapter.requestDevice();
}
