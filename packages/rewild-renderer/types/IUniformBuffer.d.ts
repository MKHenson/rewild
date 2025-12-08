import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';
import { Mesh } from '../lib/core/Mesh';
import { Transform } from '../lib/core/Transform';

export interface IUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  destroy(): void;
  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void;
}

export interface IPerMeshUniformBuffer extends IUniformBuffer {
  prepare(renderer: Renderer, camera: Camera, mesh: Transform): void;
}

export interface ISharedUniformBuffer extends IUniformBuffer {
  setNumInstances(numInstances: number): void;
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void;
}
