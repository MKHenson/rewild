import { Geometry } from '../geometry/Geometry';
import { IMaterial, SharedBindGroup } from './IMaterial';
import shader from '../shaders/diffuse.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';
import { MaterialMeshManager } from './MaterialMeshManager';

export class MaterialDiffuse implements IMaterial {
  pipeline: GPURenderPipeline;
  sharedBindGroup: SharedBindGroup;

  meshManager: MaterialMeshManager;
  requiresRebuild: boolean = true;

  private _texture: GPUTexture;
  private _sampler: GPUSampler;

  constructor() {
    this.meshManager = new MaterialMeshManager(this, () => [
      new ProjModelView(0),
    ]);
  }

  init(renderer: Renderer): void {
    const { device, presentationFormat } = renderer;

    if (!this._texture)
      this._texture = textureManager.get('grid-data').gpuTexture;
    if (!this._sampler) this._sampler = samplerManager.get('linear');

    const module = device.createShaderModule({
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'cube render pipeline',
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

    this.createSharedBindGroup(renderer);
  }

  private createSharedBindGroup(renderer: Renderer): void {
    const { device } = renderer;

    const sharedBindgroupIndex = 1;

    this.sharedBindGroup = {
      group: sharedBindgroupIndex,
      bindGroup: device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(sharedBindgroupIndex),
        entries: [
          {
            binding: 0,
            resource: this._sampler,
          },
          {
            binding: 1,
            resource: this._texture.createView(),
          },
        ],
      }),
    };
  }

  set texture(texture: GPUTexture) {
    this._texture = texture;
    this.requiresRebuild = true;
  }

  get texture(): GPUTexture {
    return this._texture;
  }

  set sampler(sampler: GPUSampler) {
    this._sampler = sampler;
    this.requiresRebuild = true;
  }

  get sampler(): GPUSampler {
    return this._sampler;
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!(geometry.vertices && geometry.uvs);
  }
}
