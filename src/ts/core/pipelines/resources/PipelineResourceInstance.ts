export class PipelineResourceInstance {
  group: number;
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer | null;

  constructor(group: number, bindGroup: GPUBindGroup, buffer: GPUBuffer | null = null) {
    this.group = group;
    this.bindGroup = bindGroup;
    this.buffer = buffer;
  }

  dispose(): void {
    this.buffer?.destroy();
  }
}
