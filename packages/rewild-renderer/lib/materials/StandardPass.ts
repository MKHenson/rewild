import { Geometry } from '../geometry/Geometry';
import shader from '../shaders/standard.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import { StandardPassBase } from './StandardPassBase';

const materialGroupIndex = 1;
const lightingGroupIndex = 2;
const shadowGroupIndex = 3;

// Back-to-front by view-space depth. Element 14 of the model-view matrix is the
// mesh origin's z in view space, which the renderer has already computed this
// frame — and it is negative in front of the camera, so ascending order puts
// the farthest mesh first.
const sortFarthestFirst = (a: Mesh, b: Mesh) =>
  a.transform.modelViewMatrix.elements[14] -
  b.transform.modelViewMatrix.elements[14];

/**
 * Metallic-roughness material pass — glTF's material model, and the one the
 * other scene passes are converging on.
 *
 * It sits alongside LambertPass and PhongPass rather than replacing them: those
 * still back existing materials, and terrain adopts the PBR include separately
 * in #202. The BRDF lives in shader-lib/brdf.wgsl, the light loop in
 * shader-lib/pbr-lighting.wgsl and the surface shading in
 * shader-lib/standard-material.wgsl, so nothing shading-related is private to
 * this pass — StandardInstancedPass runs the same fragment code, and the glTF
 * semantics come from the shared StandardPassBase.
 *
 * Renders into the HDR scene target (#188) — specular highlights on a smooth
 * surface run well past 1.0, and an 8-bit target would clip them at source.
 *
 * Known gap: the shadow renderers draw depth with their own pipeline and no
 * material bound, so a MASK material casts the shadow of its whole quad rather
 * than of its cutout. That matters for foliage and wants fixing where the
 * scatter lands (Understory), not here.
 */
export class StandardPass extends StandardPassBase {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;

  constructor() {
    super();
    this.material = new StandardMaterial(materialGroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.shadowUniforms = new ShadowUniforms(shadowGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.material,
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  protected invalidatePipeline(): void {
    this.requiresRebuild = true;
    for (const uniform of this.sharedUniformsTracker.uniforms)
      uniform.requiresBuild = true;
    this.perMeshTracker.meshUniforms.forEach((uniforms) => {
      for (const uniform of uniforms) uniform.requiresBuild = true;
    });
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'standard shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Standard Pass',
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
    this.sharedUniformsTracker.dispose();
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

    // With depth writes off, transparent meshes only compose correctly if they
    // arrive far-to-near. The renderer orders transparent *groups* after opaque
    // ones; this orders the meshes within one. Sorting in place is safe — the
    // render list is rebuilt from the scene every frame.
    if (this.transparent) meshes.sort(sortFarthestFirst);

    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      meshes
    );

    const tracker = this.perMeshTracker;
    const numIndices = geometry.indices!.length;

    for (const mesh of meshes) {
      tracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }
}
