import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/msdf-character.wgsl';
import { Renderer } from '..';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Camera } from '../core/Camera';
import { UIElement } from '../core/UIElement';
import { UIElementFont } from './uniforms/UIElementFont';
import { UIElementText } from './uniforms/UIElementText';

export class UITextPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  side: GPUFrontFace;
  textUniform: UIElementText;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.textUniform = new UIElementText(1);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      new UIElementFont(0),
      this.textUniform,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => []);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
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
                dstFactor: 'one',
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
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return false;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    elements: UIElement[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      elements
    );

    pass.draw(4, this.textUniform.textMeasurements.printedCharCount);
  }
}
