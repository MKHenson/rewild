export class CanvasSizeWatcher {
  canvas: HTMLCanvasElement;
  private prevWidth: number;
  private prevHeight: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.prevWidth = this.canvas.width;
    this.prevHeight = this.canvas.height;
  }

  hasResized() {
    if (
      this.canvas.width !== this.prevWidth ||
      this.canvas.height !== this.prevHeight
    ) {
      this.prevWidth = this.canvas.width;
      this.prevHeight = this.canvas.height;

      return true;
    }

    return false;
  }
}
