import { Geometry } from '../../geometry/Geometry';
import { IMaterialPass } from '../../materials/IMaterialPass';
import shader from '../shaders/atmospherePlane.wgsl';
import { Renderer } from '../..';
import { ProjModelView } from '../../materials/uniforms/ProjModelView';
import { PerMeshTracker } from '../../materials/PerMeshTracker';
import { SharedUniformsTracker } from '../../materials/SharedUniformsTracker';
import { Mesh } from '../../core/Mesh';
import { Camera } from '../../core/Camera';
import { Diffuse } from '../../materials/uniforms/Diffuse';
import { Matrix4 } from 'rewild-common';

const sharedBindgroupIndex = 1;

export class AtmosphereMaterial implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  diffuse: Diffuse;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  side: GPUFrontFace;

  cameraView: Matrix4;
  viewDirectionProjectionInverse: Matrix4;

  constructor() {
    this.requiresRebuild = true;
    this.side = 'ccw';
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

  dispose(): void {
    this.diffuse.destroy();
    this.uniformBuffer.destroy();
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
    });

    // viewDirectionProjectionInverse
    const uniformBufferSize = 16 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere plane',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = renderer.samplerManager.get('linear');
    const texture = renderer.textureManager.get('desert-sky');

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: sampler },
        {
          binding: 2,
          resource: texture.gpuTexture.createView({ dimension: 'cube' }),
        },
      ],
    });
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices;
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
    pass.setBindGroup(0, this.bindGroup);

    this.cameraView.extractRotation(camera.transform.matrixWorld);
    const viewProjection = this.viewDirectionProjectionInverse.multiplyMatrices(
      camera.projectionMatrix,
      this.cameraView
    );
    viewProjection.invert();

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      viewProjection.elements.buffer
    );
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
  }
}
