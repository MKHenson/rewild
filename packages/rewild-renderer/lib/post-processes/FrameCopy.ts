/**
 * A copy of the scene colour target, for a frame effect that reads the frame
 * while it draws over it. It follows the target's size; with `mips` above 1 it
 * has a chain of up to that many levels for the caller to fill
 * (MipMapGenerator).
 *
 *     if (this.frame.prepare(device, scene)) rebuildGroups(this.frame.view!);
 *     this.frame.copy(encoder, scene);
 */
export class FrameCopy {
  texture: GPUTexture | null = null;
  view: GPUTextureView | null = null;
  private readonly source: GPUImageCopyTexture = {
    texture: null as unknown as GPUTexture,
  };
  private readonly destination: GPUImageCopyTexture = {
    texture: null as unknown as GPUTexture,
  };
  private readonly size = [0, 0];

  constructor(private readonly label: string, private readonly mips = 1) {}

  /** Matches `scene`'s size. True when the texture was replaced, so anything
   *  bound to the old one must be rebuilt. */
  prepare(device: GPUDevice, scene: GPUTexture): boolean {
    const texture = this.texture;
    if (
      texture &&
      texture.width === scene.width &&
      texture.height === scene.height
    )
      return false;
    texture?.destroy();
    const chained = this.mips > 1;
    this.texture = device.createTexture({
      label: this.label,
      size: [scene.width, scene.height],
      format: scene.format,
      mipLevelCount: Math.min(
        this.mips,
        Math.floor(Math.log2(Math.max(scene.width, scene.height))) + 1
      ),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        (chained ? GPUTextureUsage.RENDER_ATTACHMENT : 0),
    });
    this.view = this.texture.createView();
    return true;
  }

  /** Copies `scene` into the top level. */
  copy(encoder: GPUCommandEncoder, scene: GPUTexture): void {
    this.source.texture = scene;
    this.destination.texture = this.texture!;
    this.size[0] = scene.width;
    this.size[1] = scene.height;
    encoder.copyTextureToTexture(this.source, this.destination, this.size);
  }

  dispose(): void {
    this.texture?.destroy();
    this.texture = null;
    this.view = null;
  }
}
