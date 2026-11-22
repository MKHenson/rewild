import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/swim-instanced.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { EnvironmentUniforms } from './uniforms/EnvironmentUniforms';
import { StandardPassBase } from './StandardPassBase';
import { ShaderDefines, composeShader } from '../utils/shaderDefines';
import { IVisualComponent } from '../../types/interfaces';
import type { SwimBatchMesh } from '../renderers/swim/SwimBatch';

const materialGroupIndex = 0;
const instanceGroupIndex = 1;
const lightingGroup = 2;
const environmentGroup = 3;

/**
 * Fish that bend in the vertex stage: StandardPass's shading over one draw per
 * batch and primitive, with each instance's wave read from the batch's buffer.
 * See swim-instanced.wgsl.
 */
export class SwimInstancedPass extends StandardPassBase {
  pipeline: GPURenderPipeline;
  perMeshTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  environmentUniforms: EnvironmentUniforms;

  private _finMask = false;

  constructor() {
    super();
    this.material = new StandardMaterial(materialGroupIndex);
    this.lightingUniforms = new Lighting(lightingGroup);
    this.environmentUniforms = new EnvironmentUniforms(
      environmentGroup,
      true,
      true,
      true
    );

    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.material,
      this.lightingUniforms,
      this.environmentUniforms,
    ]);
  }

  /** Reads COLOR_0.r as a fin mask rather than a tint. Only for geometry that
   *  carries COLOR_0. */
  get finMask(): boolean {
    return this._finMask;
  }

  set finMask(value: boolean) {
    if (value === this._finMask) return;
    this._finMask = value;
    this.invalidatePipeline();
  }

  protected bindsVertexColors(): boolean {
    return this._finMask || super.bindsVertexColors();
  }

  protected shaderDefines(): ShaderDefines {
    return { ...super.shaderDefines(), HAS_FIN_MASK: this._finMask };
  }

  protected invalidatePipeline(): void {
    this.requiresRebuild = true;
    for (const uniform of this.perMeshTracker.uniforms)
      uniform.requiresBuild = true;
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'swim instanced shader',
      code: composeShader([shader], this.shaderDefines()),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Swim Instanced Pass',
      layout: 'auto',
      vertex: {
        entryPoint: this.vertexEntryPoint(),
        module,
        buffers: this.vertexBufferLayouts(),
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: renderer.sceneTargets(
          { format: sceneColorFormat, blend: this.blendState() },
          !this.transparent
        ),
      },
      multisample: { count: renderer.sampleCount },
      primitive: this.primitiveState(),
      depthStencil: this.depthStencilState(),
    });
  }

  dispose(): void {
    this.perMeshTracker.dispose();
  }

  /** The layout a batch's own bind group is built against. */
  instanceBindGroupLayout(): GPUBindGroupLayout {
    return this.pipeline.getBindGroupLayout(instanceGroupIndex);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: IVisualComponent[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    this.setVertexBuffers(pass, geometry);
    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);

    const numIndices = geometry.indices!.length;
    const projection = camera.projectionMatrix.elements;

    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i] as SwimBatchMesh;
      const count = mesh.batch.count;
      if (count === 0) continue;

      const bindGroup = mesh.prepare(renderer, this);
      if (!bindGroup) continue;
      mesh.writeFrameUniforms(
        renderer,
        projection,
        mesh.transform.modelViewMatrix.elements
      );

      pass.setBindGroup(instanceGroupIndex, bindGroup);
      pass.drawIndexed(numIndices, count);
    }
  }
}
