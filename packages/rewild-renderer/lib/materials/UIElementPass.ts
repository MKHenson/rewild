import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/gui-instanced.wgsl';
import { Renderer } from '..';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Camera } from '../core/Camera';
import { UIElementShared } from './uniforms/UIElementShared';
import { UIElementInstanceData } from './uniforms/UIElementInstanceData';
import { UIElement } from '../core/UIElement';
import { IUIElementPass } from './IUIElementPass';

export class UIElementPass implements IUIElementPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  side: GPUFrontFace;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      new UIElementShared(0),
      new UIElementInstanceData(1),
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
      label: 'gui pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 2 * 4, // (2) floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [
              {
                // uv
                shaderLocation: 1,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
        ],
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
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
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
    return !!(geometry.vertices && geometry.uvs);
  }

  /** Upload all uniform data for the given elements in one batch. */
  prepareUniforms(
    renderer: Renderer,
    camera: Camera,
    elements: UIElement[]
  ): void {
    const uniforms = this.sharedUniformsTracker.uniforms;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      const uniform = uniforms[i];
      if (uniform.requiresBuild) {
        uniform.build(
          renderer,
          this.pipeline.getBindGroupLayout(uniform.group)
        );
      }
      uniform.prepare(renderer, camera, elements);
    }
  }

  /** Set pipeline, vertex/index buffers, and bind groups on the pass. */
  setPassState(pass: GPURenderPassEncoder, geometry: Geometry): void {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
    const uniforms = this.sharedUniformsTracker.uniforms;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      const uniform = uniforms[i];
      if (uniform.bindGroup) {
        pass.setBindGroup(uniform.group, uniform.bindGroup);
      }
    }
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    elements: UIElement[],
    geometry: Geometry
  ): void {
    this.prepareUniforms(renderer, camera, elements);
    this.setPassState(pass, geometry);
    const numIndices = geometry.indices!.length;
    pass.drawIndexed(numIndices, elements.length);
  }
}
