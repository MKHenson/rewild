export class PipelineResourceInstance {
  group: number;
  bindGroup: GPUBindGroup;
  buffers: GPUBuffer[] | null;

  constructor(group: number, bindGroup: GPUBindGroup, buffer: GPUBuffer[] | null = null) {
    this.group = group;
    this.bindGroup = bindGroup;
    this.buffers = buffer;
  }

  dispose(): void {
    if (this.buffers) this.buffers!.forEach((b) => b.destroy());
  }
}
