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

  readonly mapChunkSize = 241;
  #_levelOfDetail: number = 0; // Must be any int from 0 to 6

  simplify: HTMLButtonElement | null = null;

  constructor() {}

  init(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    if (!this.simplify) {
      this.simplify = document.createElement('button');
      this.simplify.innerText = 'Simplify';
      this.simplify.style.position = 'absolute';
      this.simplify.style.top = '0px';
      this.simplify.onclick = () => {
        this.levelOfDetail = this.#_levelOfDetail + 1;
        this.init(renderer);
      };
      document.body.appendChild(this.simplify);
    }

    const mapChunkSize = this.mapChunkSize;
    // const width = mapChunkSize;
    // const height = mapChunkSize;

    const noise = generateNoiseMap(mapChunkSize, mapChunkSize, 24);

    // Convert this noise map of f32 to a u8 texture. Each pixel will be a shader of grey
    // (0-255) based on the noise value.
    const data = new Uint8Array(mapChunkSize * mapChunkSize * 4);
    for (let i = 0; i < mapChunkSize * mapChunkSize; i++) {
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
        mapChunkSize,
        mapChunkSize
      )
    );

    this.terrainTexture.load(device);

    const meshData = generateTerrainMesh(
      noise,
      mapChunkSize,
      mapChunkSize,
      this.#_levelOfDetail
    );
    this.plane = new Geometry();

    this.plane.vertices = new Float32Array(
      meshData.vertices.map((v) => v.toArray()).flat()
    );
    this.plane.uvs = new Float32Array(
      meshData.uvs.map((v) => v.toArray()).flat()
    );
    this.plane.indices = new Uint16Array(meshData.triangles);

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
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    this.projModelView.build(renderer, this.pipeline.getBindGroupLayout(0));

    this.bindGroup = device.createBindGroup({
      label: 'terrain textures',
      layout: this.pipeline.getBindGroupLayout(1),
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

  get levelOfDetail() {
    return this.#_levelOfDetail;
  }

  set levelOfDetail(value: number) {
    this.#_levelOfDetail = value;

    if (this.#_levelOfDetail > 6) {
      this.#_levelOfDetail = 6;
    } else if (this.#_levelOfDetail < 0) {
      this.#_levelOfDetail = 0;
    }

    // Ensure its an integer
    this.#_levelOfDetail = Math.floor(this.#_levelOfDetail);
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    this.transform.updateMatrixWorld();
    this.transform.modelViewMatrix.multiplyMatrices(
      camera.matrixWorldInverse,
      this.transform.matrixWorld
    );

    pass.setPipeline(this.pipeline);
    this.projModelView.prepare(renderer, camera, this.transform);
    pass.setBindGroup(1, this.bindGroup);
    pass.setBindGroup(0, this.projModelView.bindGroup);
    pass.setVertexBuffer(0, this.plane.vertexBuffer);
    pass.setVertexBuffer(1, this.plane.uvBuffer);
    pass.setIndexBuffer(this.plane.indexBuffer, 'uint16');
    pass.drawIndexed(this.plane.indices!.length);
  }
}
