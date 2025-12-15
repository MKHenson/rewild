import { Renderer } from '..';
import { IMeshTracker } from '../../types/IMeshTracker';
import { IMeshComponent } from '../../types/interfaces';
import { Camera } from '../core/Camera';
import { Geometry } from '../geometry/Geometry';

export interface IMaterialPass {
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean;
  side: GPUFrontFace;
  perMeshTracker?: IMeshTracker;
  sharedUniformsTracker?: IMeshTracker;
  init(renderer: Renderer): void;
  dispose(): void;
  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes?: IMeshComponent[],
    geometry?: Geometry
  ): void;
  isGeometryCompatible(geometry: Geometry): boolean;
}
