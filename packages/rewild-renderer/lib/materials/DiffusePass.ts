import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/diffuse.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Diffuse } from './uniforms/Diffuse';
import { Lighting } from './uniforms/Lighting';

const sharedBindgroupIndex = 1;
const lightingGroupIndex = 2;

export class DiffusePass implements IMaterialPass {
  cloudsPipeline: GPURenderPipeline;
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
      this.diffuse,
      this.lightingUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, presentationFormat } = renderer;
    const module = device.createShaderModule({
      code: shader,
    });

    this.cloudsPipeline = device.createRenderPipeline({
      label: 'Diffuse Pass',
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
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                // normal
                shaderLocation: 2,
                offset: 0,
                format: 'float32x3',
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
        frontFace: this.side,
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

  dispose(): void {
    this.diffuse.destroy();
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
    pass.setPipeline(this.cloudsPipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setVertexBuffer(2, geometry.normalBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint16');

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
