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
