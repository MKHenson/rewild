import { Renderer } from '../Renderer';
import { SkinnedModel } from '../renderers/skinning/SkinnedModel';

/**
 * One SkinnedModel per geometry id, created when the first SkinnedInstance of
 * that model asks for it and freed when the last one is gone.
 */
export class SkinnedModelManager {
  private readonly models = new Map<string, SkinnedModel>();

  acquire(renderer: Renderer, modelId: string): SkinnedModel {
    let model = this.models.get(modelId);
    if (model) return model;

    model = new SkinnedModel(
      renderer,
      renderer.geometryManager.getModel(modelId)
    );
    this.models.set(modelId, model);
    return model;
  }

  /** Frees the model if no instance of it is left. */
  release(modelId: string): void {
    const model = this.models.get(modelId);
    if (!model || model.poses.count > 0) return;
    model.dispose();
    this.models.delete(modelId);
  }

  /** Advances every model's clips by `dt` seconds. */
  update(dt: number): void {
    for (const model of this.models.values()) model.player.update(dt);
  }

  get(modelId: string): SkinnedModel | undefined {
    return this.models.get(modelId);
  }

  dispose(): void {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
  }
}
