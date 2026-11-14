import { Renderer } from '../Renderer';
import { SkinnedModel } from '../renderers/skinning/SkinnedModel';

/**
 * One SkinnedModel per geometry id, created when the first SkinnedInstance of
 * that model asks for it and freed when the last one is gone.
 */
export class SkinnedModelManager {
  /** Poses built in the last `update`. */
  posed = 0;

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

  /** Live instances over every model. */
  get instanceCount(): number {
    let count = 0;
    for (const model of this.models.values()) count += model.poses.count;
    return count;
  }

  /**
   * Builds every model's poses due this frame, `dt` seconds on, with the
   * camera at `x, y, z`.
   */
  update(dt: number, x: number, y: number, z: number): void {
    let posed = 0;
    for (const model of this.models.values())
      posed += model.update(dt, x, y, z);
    this.posed = posed;
  }

  get(modelId: string): SkinnedModel | undefined {
    return this.models.get(modelId);
  }

  dispose(): void {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
  }
}
