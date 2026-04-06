import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/sprite.wgsl';
import { Renderer } from '..';
import { SpriteProjView } from './uniforms/SpriteProjView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Camera } from '../core/Camera';
import { SpriteUniforms } from './uniforms/SpriteUniforms';
import { IVisualComponent } from '../../types/interfaces';

const projectionIndex = 0;
const sharedBindgroupIndex = 1;

export class SpritePass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  spriteUniforms: SpriteUniforms;
  side: GPUFrontFace;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.spriteUniforms = new SpriteUniforms(sharedBindgroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.spriteUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new SpriteProjView(projectionIndex),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, presentationFormat } = renderer;
    const module = device.createShaderModule({
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Sprite Pass',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
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
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none', // Billboard sprites should be visible from both sides
        frontFace: this.side,
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
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

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: IVisualComponent[],
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
