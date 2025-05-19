import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/atmosphereWithWeather.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Diffuse } from './uniforms/Diffuse';
import { degToRad, Matrix4, Vector3 } from 'rewild-common';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';

const sharedBindgroupIndex = 1;

const uniformBufferSize =
  16 * 4 + // modelMatrix
  16 * 4 + // projectionMatrix
  16 * 4 + // modelViewMatrix
  4 * 4 + // cameraPosition
  4 * 4 + // sunPosition
  4 * 4 + // up
  4 + // rayleigh
  4 + // turbidity
  4 + // mieCoefficient
  4 + // mieDirectionalG
  4 + // iTime
  4 + // resolutionX
  4 + // resolutionY
  4; // cloudiness

function generateNoiseData(size: number): Float32Array {
  const data = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = Math.random(); // Replace with your noise generation logic if needed
  }
  return data;
}

export class AtmosphereCubeMaterial implements IMaterialPass {
  cloudsPipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  diffuse: Diffuse;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;

  cameraView: Matrix4;
  viewDirectionProjectionInverse: Matrix4;

  elevation: f32;
  azimuth: f32;

  constructor() {
    this.azimuth = 180;
    this.elevation = 2;

    this.requiresRebuild = true;
    this.cameraView = new Matrix4();
    this.viewDirectionProjectionInverse = new Matrix4();

    this.diffuse = new Diffuse(sharedBindgroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.diffuse,
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
      label: 'Atmosphere Plane Pass',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
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
        module,
        targets: [{ format: presentationFormat }],
        entryPoint: 'fs',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
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
        frontFace: 'cw',
      },
    });

    // Align the buffer size to the next multiple of 256
    const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 256) * 256;

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere cube',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create noise buffer
    const noiseData = generateNoiseData(256 * 256); // Adjust size as needed
    const noiseBuffer = device.createBuffer({
      label: 'noise buffer',
      size: noiseData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    // Copy noise data to the buffer
    new Float32Array(noiseBuffer.getMappedRange()).set(noiseData);
    noiseBuffer.unmap();

    this.bindGroup = device.createBindGroup({
      label: 'bind group for cube atmosphere',
      layout: this.cloudsPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
        {
          binding: 1,
          resource: textureManager
            .get('rgba-noise-256')
            .gpuTexture.createView(),
        },
        {
          binding: 2,
          resource: samplerManager.get('linear'),
        },
      ],
    });
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices && !!geometry.uvs;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes?: Mesh[],
    geometry?: Geometry
  ): void {
    const { device, canvas } = renderer;
    pass.setPipeline(this.cloudsPipeline);
    pass.setVertexBuffer(0, geometry!.vertexBuffer);
    pass.setVertexBuffer(1, geometry!.uvBuffer);
    pass.setIndexBuffer(geometry!.indexBuffer, 'uint16');

    // Align the buffer size to the next multiple of 256
    const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 256) * 256;

    // prettier-ignore
    const uniformData = new Float32Array(alignedUniformBufferSize / 4);

    this.elevation += renderer.delta * 0.01;

    // cloudiness is a value between -0.5 and 0.5
    const cloudiness = -0.1;

    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);
    const sunPosition = new Vector3().setFromSphericalCoords(1, phi, theta);

    const sizeOfMat4 = 4 * 4;
    const sizeOfVec4 = 1 * 4;

    uniformData.set(meshes![0].transform.matrixWorld.elements, 0); // modelMatrix
    uniformData.set(camera.projectionMatrix.elements, sizeOfMat4); // projectionMatrix
    uniformData.set(
      meshes![0].transform.modelViewMatrix.elements,
      sizeOfMat4 * 2
    ); // modelViewMatrix
    uniformData.set(
      [
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
      ],
      sizeOfMat4 * 3
    ); // cameraPosition
    uniformData.set(
      [sunPosition.x, sunPosition.y, sunPosition.z],
      sizeOfMat4 * 3 + sizeOfVec4
    ); // sunPosition
    uniformData.set([0, 1, 0], sizeOfMat4 * 3 + sizeOfVec4 * 2); // up
    uniformData.set(
      [
        1,
        2,
        0.005,
        0.8,
        renderer.totalDeltaTime,
        canvas.width,
        canvas.height,
        cloudiness,
      ],
      sizeOfMat4 * 3 + sizeOfVec4 * 3
    ); // rayleigh, turbidity, mieCoefficient, mieDirectionalG

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(geometry!.indices!.length);
  }
}
