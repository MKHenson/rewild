import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/scatter-instanced.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import { StandardPassBase } from './StandardPassBase';
import { composeShader } from '../utils/shaderDefines';
import { IScatterInstanceGroup } from '../../types/interfaces';

const materialGroupIndex = 0;
const instanceGroupIndex = 1;
const lightingGroup = 2;
const shadowGroup = 3;

// projMatrix + modelViewMatrix + nodeMatrix + params.
export const SCATTER_UNIFORM_BYTES = 64 * 3 + 16;

// posScale + rotation + params, matching ScatterInstance in the shader.
export const SCATTER_GPU_STRIDE = 12;

/**
 * Scatter instancing — StandardPass's shading over one draw per chunk.
 *
 * Where StandardInstancedPass rebuilds a model-view matrix per instance every
 * frame, this reads a persistent per-instance transform uploaded when the chunk
 * loaded, and takes the camera from a per-draw uniform instead. That is what
 * lets a forest cost one buffer write per chunk per frame rather than one per
 * tree.
 *
 * A draw's instances live on the group it is drawing (see IScatterInstanceGroup)
 * rather than on the pass, because a pass is shared by every chunk that grows
 * the layer and each of those owns its own buffer.
 */
export class ScatterInstancedPass extends StandardPassBase {
  pipeline: GPURenderPipeline;
  perMeshTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;

  constructor() {
    super();
    this.material = new StandardMaterial(materialGroupIndex);
    this.lightingUniforms = new Lighting(lightingGroup);
    this.shadowUniforms = new ShadowUniforms(shadowGroup, true);

    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.material,
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
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
      label: 'scatter instanced shader',
      code: composeShader([shader], this.shaderDefines()),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Scatter Instanced Pass',
      layout: 'auto',
      vertex: {
        entryPoint: this.vertexEntryPoint(),
        module,
        buffers: this.vertexBufferLayouts(),
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: sceneColorFormat, blend: this.blendState() }],
      },
      multisample: { count: renderer.sampleCount },
      primitive: this.primitiveState(),
      depthStencil: this.depthStencilState(),
    });
  }

  dispose(): void {
    this.perMeshTracker.dispose();
  }

  /** The layout a group's own bind group is built against. Exposed because the
   *  instance buffer belongs to the group, not to the pass. */
  instanceBindGroupLayout(): GPUBindGroupLayout {
    return this.pipeline.getBindGroupLayout(instanceGroupIndex);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    this.setVertexBuffers(pass, geometry);
    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);

    const numIndices = geometry.indices!.length;
    const projection = camera.projectionMatrix.elements;

    for (let i = 0; i < meshes.length; i++) {
      const group = meshes[i] as unknown as IScatterInstanceGroup;
      if (group.instanceCount === 0) continue;

      const bindGroup = group.prepareInstances(renderer, this);
      if (!bindGroup) continue;

      // Only the model-view changes per frame; the projection, node matrix and
      // cull distance ride along because one small write beats several.
      group.writeFrameUniforms(
        renderer,
        projection,
        group.transform.modelViewMatrix.elements
      );

      pass.setBindGroup(instanceGroupIndex, bindGroup);
      pass.drawIndexed(numIndices, group.instanceCount);
    }
  }
}
