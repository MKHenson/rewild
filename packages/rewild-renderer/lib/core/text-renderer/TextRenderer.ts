import shader from '../../shaders/msdf-character.wgsl';
import { Renderer } from '../..';
import { UIElement } from '../UIElement';
import { FontUniforms } from './FontUniforms';
import { TextUniforms } from './TextUniforms';
import { MsdfTextFormattingOptions } from '../../../types/interfaces';

export class TextRenderer {
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean = true;
  side: GPUFrontFace;
  textUniform: TextUniforms;
  uiFont: FontUniforms;
  private renderBundle: GPURenderBundle | null = null;

  constructor(text: string = '', options?: MsdfTextFormattingOptions) {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.textUniform = new TextUniforms(1, text, options);
    this.uiFont = new FontUniforms(0);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    this.renderBundle = null;
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'msdf text pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: 'uint32',
      },
      multisample: {
        count: renderer.sampleCount,
      },
    });
  }

  dispose(): void {
    this.textUniform.destroy();
    this.uiFont.destroy();
    this.renderBundle = null;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    element: UIElement
  ): void {
    const fontUniform = this.uiFont;

    // Build font bind group if needed
    if (fontUniform.requiresBuild) {
      fontUniform.build(
        renderer,
        this.pipeline.getBindGroupLayout(fontUniform.group)
      );
      this.renderBundle = null;
    }

    // Check if element width changed — triggers text rebuild
    const elementWidth = element.getWidth(renderer);
    if (this.textUniform.lastMaxWidth !== elementWidth) {
      this.textUniform.lastMaxWidth = elementWidth;
      this.textUniform.requiresBuild = true;
    }

    // Build text uniform if needed
    if (this.textUniform.requiresBuild) {
      this.textUniform.build(
        renderer,
        this.pipeline.getBindGroupLayout(this.textUniform.group)
      );
      this.renderBundle = null;
    }

    this.textUniform.prepare(renderer, element.transform);

    // Record render bundle if invalidated
    if (!this.renderBundle) {
      const encoder = renderer.device.createRenderBundleEncoder({
        colorFormats: [renderer.presentationFormat],
        sampleCount: renderer.sampleCount,
      });
      encoder.setPipeline(this.pipeline);
      encoder.setBindGroup(fontUniform.group, fontUniform.bindGroup);
      encoder.setBindGroup(this.textUniform.group, this.textUniform.bindGroup);
      encoder.draw(4, this.textUniform.textMeasurements.printedCharCount);
      this.renderBundle = encoder.finish();
    }

    pass.executeBundles([this.renderBundle]);
  }
}
