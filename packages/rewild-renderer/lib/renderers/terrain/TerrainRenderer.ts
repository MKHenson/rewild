import { Renderer } from '../../Renderer';
import { Geometry } from '../../geometry/Geometry';
import shader from '../../shaders/terrain.wgsl';
import { DataTexture } from '../../textures/DataTexture';
import { ITexture } from '../../textures/ITexture';
import { TextureProperties } from '../../textures/Texture';
import { textureManager } from '../../textures/TextureManager';
import { generateNoiseMap } from './Noise';
import { samplerManager } from '../../textures/SamplerManager';
import { Camera } from '../../core/Camera';
import { generateTerrainMesh } from './MeshGenerator';
import { ProjModelView } from '../../materials/uniforms/ProjModelView';
import { Transform } from '../../core/Transform';

export class TerrainRenderer {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  projModelView: ProjModelView;

  terrainTexture: ITexture;
  plane: Geometry;

  transform: Transform = new Transform();

  constructor() {}

  init(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    const width = 100;
    const height = 100;

    const noise = generateNoiseMap(width, height, 24);

    // Convert this noise map of f32 to a u8 texture. Each pixel will be a shader of grey
    // (0-255) based on the noise value.
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const value = Math.floor(Math.min(1, Math.max(0, noise[i])) * 255);
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255; // alpha
    }

    this.terrainTexture = textureManager.addTexture(
      new DataTexture(
        new TextureProperties('terrain1', false),
        data,
        width,
        height
      )
    );

    this.terrainTexture.load(device);

    const meshData = generateTerrainMesh(noise, width, height);
    this.plane = new Geometry();

    this.plane.vertices = new Float32Array(
      meshData.vertices.map((v) => v.toArray()).flat()
    );
    this.plane.uvs = new Float32Array(
      meshData.uvs.map((v) => v.toArray()).flat()
    );
    this.plane.indices = new Uint16Array(meshData.triangles);

    // this.plane = PlaneGeometryFactory.new(2, 2, 1, 1);
    this.plane.build(device);

    const module = device.createShaderModule({
      code: shader,
    });

    this.projModelView = new ProjModelView(1);

    this.pipeline = device.createRenderPipeline({
      label: 'terrain render pipeline',
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
        depthCompare: 'greater',
        format: 'depth24plus',
      },
    });

    this.projModelView.build(renderer, this.pipeline.getBindGroupLayout(1));

    this.bindGroup = device.createBindGroup({
      label: 'plane bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: samplerManager.get('nearest-simple'),
        },
        {
          binding: 1,
          resource: this.terrainTexture.gpuTexture.createView(),
        },
      ],
    });
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    pass.setPipeline(this.pipeline);
    this.projModelView.prepare(renderer, camera, this.transform);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, this.projModelView.bindGroup);
    pass.setVertexBuffer(0, this.plane.vertexBuffer);
    pass.setVertexBuffer(1, this.plane.uvBuffer);
    pass.setIndexBuffer(this.plane.indexBuffer, 'uint16');
    pass.drawIndexed(this.plane.indices!.length);
  }
}
