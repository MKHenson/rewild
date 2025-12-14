import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/gui.wgsl';
import { Renderer } from '..';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Diffuse } from './uniforms/Diffuse';
import { Lighting } from './uniforms/Lighting';
import { UIElementShared } from './uniforms/UIElementShared';

const sharedBindgroupIndex = 1;
const lightingGroupIndex = 2;

export class UIElementPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  diffuse: Diffuse;
  lightingUniforms: Lighting;
  side: GPUFrontFace;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.diffuse = new Diffuse(sharedBindgroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      new UIElementShared(0),
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
          {
            arrayStride: 4 * 4, // (4) floats, 4 bytes each
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x2' }, // offset
              { shaderLocation: 3, offset: 8, format: 'float32x2' }, // size
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
    this.diffuse.destroy();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!(geometry.vertices && geometry.uvs);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      meshes
    );

    const tracker = this.perMeshTracker;
    const numIndices = geometry.indices!.length;

    for (const mesh of meshes) {
      tracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }
}
