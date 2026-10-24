import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/standard-skinned.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { EnvironmentUniforms } from './uniforms/EnvironmentUniforms';
import { StandardPassBase } from './StandardPassBase';
import { composeShader } from '../utils/shaderDefines';
import { IVisualComponent } from '../../types/interfaces';
import { IS_SKINNED_INSTANCED_PASS } from '../typeGuards';
import type { SkinnedMesh } from '../core/SkinnedMesh';
import type { SkinnedModel } from '../renderers/skinning/SkinnedModel';

const materialGroupIndex = 0;
const instanceGroupIndex = 1;
const lightingGroup = 2;
const environmentGroup = 3;

/** world + slot, padded to SkinnedInstance's std430 size in the shaders. */
export const SKINNED_INSTANCE_FLOATS = 20;
/** projMatrix + viewMatrix + params, matching Uniforms in standard-skinned.wgsl. */
const UNIFORM_FLOATS = 16 * 2 + 4;

/**
 * Packs a SkinnedMesh's world matrix and pose slot as instance `index` of
 * `data`, with `slots` a Uint32Array view over the same buffer.
 */
export function writeSkinnedInstance(
  mesh: IVisualComponent,
  data: Float32Array,
  slots: Uint32Array,
  index: number
): void {
  const o = index * SKINNED_INSTANCE_FLOATS;
  data.set(mesh.transform.matrixWorld.elements, o);
  slots[o + 16] = (mesh as SkinnedMesh).instance.slot;
}

/**
 * StandardPass's shading over skinned meshes: every visible SkinnedMesh of one
 * model primitive is one instanced draw. Each frame the pass writes the drawn
 * meshes' world matrices and pose slots; the joint matrices come from the
 * model's shared buffer, indexed by slot.
 */
export class SkinnedInstancedPass extends StandardPassBase {
  readonly [IS_SKINNED_INSTANCED_PASS] = true as const;

  pipeline: GPURenderPipeline;
  perMeshTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  environmentUniforms: EnvironmentUniforms;
  /** The model whose poses this pass draws. Set by SkinnedModel. */
  model: SkinnedModel | null = null;
  /** `performance.now()` and mesh count of the last draw, for the debug
   *  commands. */
  lastDrawn = 0;
  lastDrawnCount = 0;

  private instanceData = new Float32Array(0);
  private instanceSlots = new Uint32Array(0);
  private instanceBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private bindGroupPipeline: GPURenderPipeline | null = null;
  private bindGroupJoints: GPUBuffer | null = null;
  private readonly frameUniforms = new Float32Array(UNIFORM_FLOATS);

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

  protected invalidatePipeline(): void {
    this.requiresRebuild = true;
    for (const uniform of this.perMeshTracker.uniforms)
      uniform.requiresBuild = true;
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return (
      !!geometry.joints &&
      !!geometry.weights &&
      super.isGeometryCompatible(geometry)
    );
  }

  /** The standard layout, then JOINTS_0 and WEIGHTS_0 at locations 5 and 6. */
  protected vertexBufferLayouts(): GPUVertexBufferLayout[] {
    return [
      ...super.vertexBufferLayouts(),
      {
        arrayStride: 2 * 4,
        attributes: [{ shaderLocation: 5, offset: 0, format: 'uint16x4' }],
      },
      {
        arrayStride: 4 * 4,
        attributes: [{ shaderLocation: 6, offset: 0, format: 'float32x4' }],
      },
    ];
  }

  protected setVertexBuffers(
    pass: GPURenderPassEncoder,
    geometry: Geometry
  ): void {
    super.setVertexBuffers(pass, geometry);
    const slot =
      3 + (this.bindsVertexColors() ? 1 : 0) + (this.vertexTangents ? 1 : 0);
    pass.setVertexBuffer(slot, geometry.jointBuffer);
    pass.setVertexBuffer(slot + 1, geometry.weightBuffer);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'standard skinned shader',
      code: composeShader([shader], this.shaderDefines()),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Standard Skinned Pass',
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
    this.instanceBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.instanceBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: IVisualComponent[],
    geometry: Geometry
  ): void {
    const model = this.model;
    const count = meshes.length;
    if (!model || count === 0 || !model.prepareJoints(renderer)) return;

    pass.setPipeline(this.pipeline);
    this.setVertexBuffers(pass, geometry);
    if (
      !this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes)
    )
      return;

    const { device } = renderer;
    this.ensureInstanceCapacity(renderer, count);
    for (let i = 0; i < count; i++)
      writeSkinnedInstance(meshes[i], this.instanceData, this.instanceSlots, i);
    device.queue.writeBuffer(
      this.instanceBuffer!,
      0,
      this.instanceData,
      0,
      count * SKINNED_INSTANCE_FLOATS
    );

    const uniforms = this.frameUniforms;
    uniforms.set(camera.projectionMatrix.elements, 0);
    uniforms.set(camera.matrixWorldInverse.elements, 16);
    uniforms[32] = model.poses.jointCount;
    device.queue.writeBuffer(this.uniformBuffer!, 0, uniforms);

    pass.setBindGroup(instanceGroupIndex, this.instanceBindGroup(renderer));
    pass.drawIndexed(geometry.indices!.length, count);
    this.lastDrawn = performance.now();
    this.lastDrawnCount = count;
  }

  /** Grows the per-draw instance buffer to hold `count` meshes. */
  private ensureInstanceCapacity(renderer: Renderer, count: number): void {
    const { device } = renderer;
    this.uniformBuffer ??= device.createBuffer({
      label: 'skinned pass uniforms',
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const floats = count * SKINNED_INSTANCE_FLOATS;
    if (this.instanceBuffer && this.instanceData.length >= floats) return;

    const capacity = Math.max(8, 1 << Math.ceil(Math.log2(count)));
    this.instanceData = new Float32Array(capacity * SKINNED_INSTANCE_FLOATS);
    this.instanceSlots = new Uint32Array(this.instanceData.buffer);
    this.instanceBuffer?.destroy();
    this.instanceBuffer = device.createBuffer({
      label: 'skinned pass instances',
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = null;
  }

  /** An 'auto' layout belongs to one pipeline, and the instance and joint
   *  buffers are replaced as they grow. */
  private instanceBindGroup(renderer: Renderer): GPUBindGroup {
    const joints = this.model!.jointBuffer!;
    if (
      this.bindGroup &&
      this.bindGroupPipeline === this.pipeline &&
      this.bindGroupJoints === joints
    )
      return this.bindGroup;

    this.bindGroup = renderer.device.createBindGroup({
      label: 'skinned pass instances',
      layout: this.pipeline.getBindGroupLayout(instanceGroupIndex),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer! } },
        { binding: 1, resource: { buffer: this.instanceBuffer! } },
        { binding: 2, resource: { buffer: joints } },
      ],
    });
    this.bindGroupPipeline = this.pipeline;
    this.bindGroupJoints = joints;
    return this.bindGroup;
  }
}
