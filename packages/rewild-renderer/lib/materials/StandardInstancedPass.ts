import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/standard-instanced.wgsl';
import { Renderer } from '..';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import { ProjectionAndInstances } from './uniforms/ProjectionAndInstances';
import { StandardPassBase } from './StandardPassBase';

const materialGroupIndex = 0;
const projectionAndInstancesGroup = 1;
const lightingGroup = 2;
const shadowGroup = 3;

/**
 * Instanced metallic-roughness material — StandardPass's shading over one draw
 * call, the way LambertInstancedPass relates to LambertPass.
 *
 * Every mesh sharing this material and geometry becomes an instance: their
 * model-view and normal matrices go into a storage buffer and the whole group
 * is drawn with a single drawIndexed. That is what Understory's scatter needs a
 * target for — a field of ferns is one draw, not one per blade.
 *
 * Shading is identical to StandardPass by construction, not by convention: both
 * fragment stages are a call into shadeStandardSurface() in shader-lib, and
 * both read their glTF semantics from StandardPassBase. What differs is only
 * the plumbing — the material moves to group 0 (there is no per-mesh group to
 * displace it), and there is no selection tint, since `selected` is a per-mesh
 * flag with no per-instance equivalent.
 */
export class StandardInstancedPass extends StandardPassBase {
  pipeline: GPURenderPipeline;
  // Named perMeshTracker to satisfy IMaterialPass's tracker slot, but it is a
  // shared tracker: an instanced pass has no per-mesh bind groups at all. Same
  // arrangement as LambertInstancedPass.
  perMeshTracker: SharedUniformsTracker;
  material: StandardMaterial;
  projectionAndInstances: ProjectionAndInstances;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;

  constructor() {
    super();
    this.material = new StandardMaterial(materialGroupIndex);
    this.projectionAndInstances = new ProjectionAndInstances(
      projectionAndInstancesGroup
    );
    this.lightingUniforms = new Lighting(lightingGroup);
    this.shadowUniforms = new ShadowUniforms(shadowGroup, true);

    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.material,
      this.projectionAndInstances,
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
      label: 'standard instanced shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Standard Instanced Pass',
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

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setVertexBuffer(2, geometry.normalBuffer);
    if (this.vertexColors) pass.setVertexBuffer(3, geometry.colorBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    // No back-to-front sort for a BLEND material here, unlike StandardPass:
    // one draw covers every instance, so the order is the instance buffer's and
    // sorting it would mean rewriting the transforms every frame. Alpha-blended
    // instancing composes correctly only where the instances do not overlap;
    // MASK is the mode a scatter of cutouts should be using anyway, and it is
    // order-independent.
    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);

    const numIndices = geometry.indices!.length;
    pass.drawIndexed(numIndices, meshes.length);
  }
}
