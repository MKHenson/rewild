import { Renderer } from '..';
import { IMeshTracker } from '../../types/IMeshTracker';
import { IVisualComponent } from '../../types/interfaces';
import { Camera } from '../core/Camera';
import { Geometry } from '../geometry/Geometry';

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
