import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';
import { Mesh } from '../lib/core/Mesh';

export interface IUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;
  destroy(): void;
  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void;
}

export interface IPerMeshUniformBuffer extends IUniformBuffer {
  prepare(renderer: Renderer, camera: Camera, mesh: Mesh): void;
}

export interface ISharedUniformBuffer extends IUniformBuffer {
  setNumInstances(numInstances: number): void;
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void;
}
