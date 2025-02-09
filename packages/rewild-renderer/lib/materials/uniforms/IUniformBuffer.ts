import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';

export interface IUniformBuffer {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;
  init(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void;
  prepareBuffer(renderer: Renderer, mesh: Mesh): void;
}
