import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/standard.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { AlphaMode, StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';

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
 * still back existing materials, and terrain adopts the PBR include separately.
 * The BRDF itself lives in shader-lib/brdf.wgsl and the light loop in
 * shader-lib/pbr-lighting.wgsl, so nothing shading-related is private to this
 * pass.
 *
 * glTF's per-material *pipeline* semantics live here rather than in the uniform
 * block, because each of them selects pipeline state: alphaMode picks the blend
 * and depth-write state, doubleSided picks the cull mode, and vertexColors picks
 * the vertex layout and entry point. The shader sees all three as well — the
 * pipeline alone cannot discard a fragment or mirror a back face's normal.
 */
export class StandardPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;
  side: GPUFrontFace;

  private _alphaMode: AlphaMode = 'OPAQUE';
  private _doubleSided: boolean = false;
  private _vertexColors: boolean = false;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
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

  /**
   * - OPAQUE — no blending, depth written, alpha forced to 1.
   * - MASK   — as OPAQUE, but fragments below `alphaCutoff` are discarded.
   *            Cheaper and order-independent, which is why cutouts use it.
   * - BLEND  — src-alpha blending with depth writes *off*, so a transparent
   *            surface does not hide what is behind it.
   */
  get alphaMode(): AlphaMode {
    return this._alphaMode;
  }

  set alphaMode(mode: AlphaMode) {
    if (mode === this._alphaMode) return;
    this._alphaMode = mode;
    // The shader needs it too — _invalidatePipeline rewrites the block.
    this.material.alphaMode = mode;
    this._invalidatePipeline();
  }

  /** Renders back faces too, with the shading normal mirrored for them. What a
   *  leaf card or a single-sided sheet of cloth needs. */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(value: boolean) {
    if (value === this._doubleSided) return;
    this._doubleSided = value;
    this._invalidatePipeline();
  }

  /**
   * Multiply base colour (and opacity) by the geometry's COLOR_0 attribute.
   * Off by default: it changes the vertex layout, so a pass with it on can only
   * draw geometry that actually carries colours — see isGeometryCompatible.
   */
  get vertexColors(): boolean {
    return this._vertexColors;
  }

  set vertexColors(value: boolean) {
    if (value === this._vertexColors) return;
    this._vertexColors = value;
    this._invalidatePipeline();
  }

  /** Read by the renderer to draw transparent groups after opaque ones. */
  get transparent(): boolean {
    return this._alphaMode === 'BLEND';
  }

  /**
   * A rebuilt pipeline hands out new bind group layouts (the layout is 'auto'),
   * so every bind group built against the old ones has to be rebuilt with it —
   * otherwise the first draw after a change fails validation.
   */
  private _invalidatePipeline(): void {
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

    const buffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: 4 * 3,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
      },
      {
        arrayStride: 4 * 2,
        attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
      },
      {
        arrayStride: 4 * 3,
        attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
      },
    ];

    if (this._vertexColors) {
      buffers.push({
        arrayStride: 4 * 4,
        attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }],
      });
    }

    // Only BLEND blends. Leaving it enabled for OPAQUE would be harmless while
    // alpha is forced to 1, but it is a per-fragment read-modify-write of the
    // colour target for nothing.
    const blend: GPUBlendState | undefined = this.transparent
      ? {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        }
      : undefined;

    this.pipeline = device.createRenderPipeline({
      label: 'Standard Pass',
      layout: 'auto',
      vertex: {
        entryPoint: this._vertexColors ? 'vsVertexColors' : 'vs',
        module,
        buffers,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: sceneColorFormat, blend }],
      },
      multisample: { count: renderer.sampleCount },
      primitive: {
        topology: 'triangle-list',
        cullMode: this._doubleSided ? 'none' : 'back',
        frontFace: this.side,
      },
      depthStencil: {
        // A transparent surface still tests against depth, but writing it would
        // let whichever transparent fragment happened to land first occlude the
        // ones behind it.
        depthWriteEnabled: !this.transparent,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    if (this._vertexColors && !geometry.colors) return false;
    return !!(geometry.vertices && geometry.uvs && geometry.normals);
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
    if (this._vertexColors) pass.setVertexBuffer(3, geometry.colorBuffer);
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
