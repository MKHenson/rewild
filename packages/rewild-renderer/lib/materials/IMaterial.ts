import { Renderer } from '..';
import { Geometry } from '../geometry/Geometry';
import { MaterialMeshManager } from './MaterialMeshManager';

export type SharedBindGroup = { group: number; bindGroup: GPUBindGroup };

export interface IMaterial {
  pipeline: GPURenderPipeline;
  sharedBindGroup: SharedBindGroup;
  init(renderer: Renderer): void;
  isGeometryCompatible(geometry: Geometry): boolean;
  meshManager: MaterialMeshManager;
}
