/** Reports when the renderer's scene size changes. */
export class SceneSizeWatcher {
  private prevWidth: number;
  private prevHeight: number;

  constructor(
    private readonly size: { sceneWidth: number; sceneHeight: number }
  ) {
    this.prevWidth = size.sceneWidth;
    this.prevHeight = size.sceneHeight;
  }

  hasResized() {
    const { sceneWidth, sceneHeight } = this.size;
    if (sceneWidth === this.prevWidth && sceneHeight === this.prevHeight)
      return false;

    this.prevWidth = sceneWidth;
    this.prevHeight = sceneHeight;
    return true;
  }
}
