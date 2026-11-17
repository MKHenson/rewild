export interface PixelSize {
  width: number;
  height: number;
}

/**
 * The backing size in device pixels for a canvas of the given CSS size.
 * Never less than 1 by 1, because WebGPU cannot configure an empty canvas.
 */
export function canvasPixelSize(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number
): PixelSize {
  return {
    width: Math.max(1, Math.round(cssWidth * pixelRatio)),
    height: Math.max(1, Math.round(cssHeight * pixelRatio)),
  };
}

export interface CanvasResize {
  /** The canvas's content box in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /**
   * The content box in device pixels, exact, or null when the browser does
   * not give it. Safari does not.
   */
  devicePixels: PixelSize | null;
}

/**
 * Calls `onResize` when the canvas's size changes. A backing texture of
 * exactly `devicePixels` maps 1:1 to the screen. A size rounded from the CSS
 * size can be a fraction of a pixel off, and the browser then resamples the
 * canvas, which blurs text. Returns a function that stops watching.
 */
export function observeCanvasSize(
  canvas: HTMLCanvasElement,
  onResize: (size: CanvasResize) => void
): () => void {
  const observer = new ResizeObserver(([entry]) => {
    const css = entry.contentBoxSize[0];
    const device = entry.devicePixelContentBoxSize?.[0];
    onResize({
      cssWidth: css.inlineSize,
      cssHeight: css.blockSize,
      devicePixels: device
        ? { width: device.inlineSize, height: device.blockSize }
        : null,
    });
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    // The box is not supported, so watch the CSS size.
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}
