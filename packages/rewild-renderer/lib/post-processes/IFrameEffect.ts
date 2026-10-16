import type { Renderer } from '../Renderer';
import type { Camera } from '../core/Camera';

/**
 * Draws over the composited HDR frame, after the atmosphere and before the
 * water lens, bloom and the tonemap. The renderer runs its effects in
 * `Renderer.frameEffects` order each frame and disposes them with itself.
 */
export interface IFrameEffect {
  /** Draws over `scene`, the scene colour target, seen through `sceneView`. */
  render(
    renderer: Renderer,
    camera: Camera,
    scene: GPUTexture,
    sceneView: GPUTextureView
  ): void;
  dispose(): void;
}
