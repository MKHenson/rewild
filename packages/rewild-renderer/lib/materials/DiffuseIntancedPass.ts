import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/diffuse-instanced.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Projection } from './uniforms/Projection';
import { InstanceMatrices } from './uniforms/InstanceMatrices';
import { Diffuse } from './uniforms/Diffuse';

const sharedBindgroupIndex = 0;
const projectionGroup = 1;
const instancesGroup = 2;

export class DiffuseIntancedPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: SharedUniformsTracker;
  requiresRebuild: boolean = true;
  diffuse: Diffuse;

  constructor() {
    this.requiresRebuild = true;
    this.diffuse = new Diffuse(sharedBindgroupIndex);

    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.diffuse,
      new Projection(projectionGroup),
      new InstanceMatrices(instancesGroup),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, presentationFormat } = renderer;
    const module = device.createShaderModule({
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Diffuse Instanced Pass',
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

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
        frontFace: 'ccw',
      },
      // Enable depth testing so that the fragment closest to the camera
      // is rendered in front.
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
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
    pass.setIndexBuffer(geometry.indexBuffer, 'uint16');

    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);
    const numIndices = geometry.indices!.length;
    pass.drawIndexed(numIndices, meshes.length);
  }
}
