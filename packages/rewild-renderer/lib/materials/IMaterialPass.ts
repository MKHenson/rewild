import { Renderer } from '..';
import { IMeshTracker } from '../../types/IMeshTracker';
import { IVisualComponent } from '../../types/interfaces';
import { Camera } from '../core/Camera';
import { Geometry } from '../geometry/Geometry';

/**
 * Bucket a material pass counts towards in the perf panel.
 *
 * Terrain, scatter and everything else all draw through one `renderGroupings`
 * call inside a single render pass, and a timestamp can only bracket a whole
 * pass. So the panel reports their cost by ablation rather than by timing:
 * `setSceneCategoryEnabled` holds one back and the `scene` row moves by what it
 * was costing. On a tile-based GPU that is the more honest measurement anyway,
 * since it includes the overdraw and tile pressure a split-pass timing would
 * change.
 */
export type SceneCategory = 'terrain' | 'scatter' | 'water' | 'opaque';

export interface IMaterialPass {
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean;
  side: GPUFrontFace;
  /**
   * Blends rather than writes, and so must be drawn after everything opaque —
   * see Renderer.organizeVisuals. A pass that leaves this unset is opaque.
   */
  transparent?: boolean;
  /**
   * Rasterizes back faces as well as front. Raycasting reads it for the same
   * reason the pipeline does
   */
  doubleSided?: boolean;
  /** Which bucket this pass counts towards. Unset means 'opaque'. */
  profileCategory?: SceneCategory;
  perMeshTracker?: IMeshTracker;
  sharedUniformsTracker?: IMeshTracker;
  init(renderer: Renderer): void;
  dispose(): void;
  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes?: IVisualComponent[],
    geometry?: Geometry
  ): void;
  isGeometryCompatible(geometry: Geometry): boolean;
}
