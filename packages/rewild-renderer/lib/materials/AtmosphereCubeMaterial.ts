import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/atmosphereCube.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Diffuse } from './uniforms/Diffuse';
import { degToRad, Matrix4, Vector3 } from 'rewild-common';

const sharedBindgroupIndex = 1;

export class AtmosphereCubeMaterial implements IMaterialPass {
  pipeline: GPURenderPipeline;
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

    this.pipeline = device.createRenderPipeline({
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
      4; // mieDirectionalG

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere cube',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for cube atmosphere',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
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
    const { device } = renderer;
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry!.vertexBuffer);
    pass.setVertexBuffer(1, geometry!.uvBuffer);
    pass.setIndexBuffer(geometry!.indexBuffer, 'uint16');

    // prettier-ignore
    const uniformData = new Float32Array(
      4 * 4 + // modelMatrix
      4 * 4 + // projectionMatrix
      4 * 4 + // modelViewMatrix
      1 * 4 + // cameraPosition
      1 * 4 + // sunPosition
      1 * 4 + // up
      1 + // rayleigh
      1 + // turbidity
      1 + // mieCoefficient
      1 // mieDirectionalG
    );

    this.elevation += renderer.delta * 0.001;

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
    uniformData.set([1, 2, 0.005, 0.8], sizeOfMat4 * 3 + sizeOfVec4 * 3); // rayleigh, turbidity, mieCoefficient, mieDirectionalG

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    pass.setBindGroup(0, this.bindGroup);
    pass.drawIndexed(geometry!.indices!.length);
  }
}
