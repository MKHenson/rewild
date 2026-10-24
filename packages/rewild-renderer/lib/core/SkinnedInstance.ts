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
