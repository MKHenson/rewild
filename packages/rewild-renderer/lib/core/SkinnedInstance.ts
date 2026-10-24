import { Renderer } from '../Renderer';
import { SkinnedModel } from '../renderers/skinning/SkinnedModel';
import { SkinnedMesh } from './SkinnedMesh';
import { Transform } from './Transform';

/**
 * One placed copy of a skinned glTF model: its pose, and a SkinnedMesh per
 * primitive drawn in that pose. Place it through `transform` like any object.
 *
 * A single-primitive model puts its mesh on `transform` itself; a model with
 * several materials hangs one child transform per primitive under it.
 */
export class SkinnedInstance {
  readonly modelId: string;
  readonly transform: Transform;
  readonly meshes: SkinnedMesh[] = [];

  private readonly model: SkinnedModel;
  private handle: number;

  constructor(
    private readonly renderer: Renderer,
    modelId: string,
    transform: Transform = new Transform()
  ) {
    this.modelId = modelId;
    this.transform = transform;
    this.model = renderer.skinnedModels.acquire(renderer, modelId);
    this.handle = this.model.poses.add();

    const { primitives } = this.model;
    if (primitives.length === 1) {
      const { geometry, pass } = primitives[0];
      this.meshes.push(new SkinnedMesh(geometry, pass, this, transform));
      return;
    }

    primitives.forEach(({ geometry, pass }, i) => {
      const mesh = new SkinnedMesh(geometry, pass, this);
      mesh.transform.name = `${modelId}[${i}]`;
      transform.addChild(mesh.transform);
      this.meshes.push(mesh);
    });
  }

  /** The pose's slot in the model's PoseStore. Changes as others are removed. */
  get slot(): number {
    return this.model.poses.slotOf(this.handle);
  }

  /** Names of the model's clips. */
  get clipNames(): string[] {
    return this.model.player.clips.map((clip) => clip.name);
  }

  hasClip(clip: string): boolean {
    return this.model.player.hasClip(clip);
  }

  /** The clip's length in seconds, or −1 if the model has no such clip. */
  clipDuration(clip: string): number {
    return this.model.player.duration(clip);
  }

  /** Crossfades to `clip` over `fade` seconds. False if the model lacks it. */
  play(clip: string, fade = 0, loop = true): boolean {
    return this.model.player.play(this.handle, clip, fade, loop);
  }

  /** Fades one clip to `weight` over `fade` seconds, leaving the others. */
  fadeTo(clip: string, weight: number, fade = 0, loop = true): boolean {
    return this.model.player.fadeTo(this.handle, clip, weight, fade, loop);
  }

  stop(clip: string, fade = 0): void {
    this.model.player.stop(this.handle, clip, fade);
  }

  stopAll(fade = 0): void {
    this.model.player.stopAll(this.handle, fade);
  }

  setClipRate(clip: string, rate: number): void {
    this.model.player.setRate(this.handle, clip, rate);
  }

  setClipTime(clip: string, seconds: number): void {
    this.model.player.setTime(this.handle, clip, seconds);
  }

  /** Seconds into the clip, or −1 when it is not playing. */
  clipTime(clip: string): number {
    return this.model.player.timeOf(this.handle, clip);
  }

  clipWeight(clip: string): number {
    return this.model.player.weightOf(this.handle, clip);
  }

  get visible(): boolean {
    return this.meshes[0].visible;
  }

  set visible(value: boolean) {
    for (const mesh of this.meshes) mesh.visible = value;
  }

  dispose(): void {
    if (this.handle < 0) return;

    for (const mesh of this.meshes) {
      if (mesh.transform.component === mesh) mesh.transform.component = null;
      if (mesh.transform !== this.transform) mesh.transform.removeFromParent();
    }
    this.model.poses.remove(this.handle);
    this.handle = -1;
    this.renderer.skinnedModels.release(this.modelId);
  }
}
