import { Renderer } from '../..';

export class FontUniforms {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();
    const font = renderer.fontManager.get('basic-font');

    this.bindGroup = device.createBindGroup({
      label: 'msdf font bind group',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: font.pageTextures[0].createView(),
        },
        {
          binding: 1,
          resource: renderer.samplerManager.get('msdf-sampler'),
        },
        {
          binding: 2,
          resource: { buffer: font.charsBuffer },
        },
      ],
    });
  }
}
