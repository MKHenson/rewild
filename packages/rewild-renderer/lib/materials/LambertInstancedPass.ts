import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/lambert-instanced.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Diffuse } from './uniforms/Diffuse';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import { ProjectionAndInstances } from './uniforms/ProjectionAndInstances';

const sharedBindgroupIndex = 0;
const projectionAndInstancesGroup = 1;
const lightingGroup = 2;
const shadowGroup = 3;

export class LambertInstancedPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: SharedUniformsTracker;
  requiresRebuild: boolean = true;
  diffuse: Diffuse;
  side: GPUFrontFace;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.diffuse = new Diffuse(sharedBindgroupIndex);

    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.diffuse,
      new ProjectionAndInstances(projectionAndInstancesGroup),
      new Lighting(lightingGroup),
      new ShadowUniforms(shadowGroup),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, presentationFormat } = renderer;
    const module = device.createShaderModule({ code: shader });

    this.pipeline = device.createRenderPipeline({
      label: 'Lambert Instanced Pass',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
          },
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
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
      multisample: { count: renderer.sampleCount },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
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
    this.perMeshTracker.dispose();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!(geometry.vertices && geometry.uvs && geometry.normals);
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
    pass.setVertexBuffer(2, geometry.normalBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);
    const numIndices = geometry.indices!.length;
    pass.drawIndexed(numIndices, meshes.length);
  }
}
