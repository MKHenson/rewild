import { Renderer } from '..';
import { IMeshTracker } from '../../types/IMeshTracker';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Geometry } from '../geometry/Geometry';

export interface IMaterialPass {
  cloudsPipeline: GPURenderPipeline;
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
    meshes?: Mesh[],
    geometry?: Geometry
  ): void;
  isGeometryCompatible(geometry: Geometry): boolean;
}
