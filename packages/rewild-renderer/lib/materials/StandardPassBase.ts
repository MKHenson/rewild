import { Renderer } from '..';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Geometry } from '../geometry/Geometry';
import { ShaderDefines } from '../utils/shaderDefines';
import { IMaterialPass } from './IMaterialPass';
import { AlphaMode, StandardMaterial } from './uniforms/StandardMaterial';

/**
 * The glTF material semantics shared by StandardPass and StandardInstancedPass.
 *
 * These live on the pass rather than in the uniform block because each selects
 * *pipeline* state: alphaMode picks the blend and depth-write state,
 * doubleSided picks the cull mode, and vertexColors and vertexTangents pick the
 * vertex layout and entry point. The shader sees them as well — a pipeline
 * alone cannot discard a fragment or mirror a back face's normal.
 *
 * The one thing the two passes must never disagree on is what a given glTF
 * material means, so that logic is here and not copied. What is left to each
 * subclass is the part that genuinely differs: which bind groups exist, and
 * whether a draw is per mesh or per instance.
 */
export abstract class StandardPassBase implements IMaterialPass {
  abstract pipeline: GPURenderPipeline;
  abstract material: StandardMaterial;

  // Left to the subclasses: what a draw looks like is exactly what differs
  // between one mesh at a time and every instance at once.
  abstract init(renderer: Renderer): void;
  abstract dispose(): void;
  abstract render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void;

  requiresRebuild: boolean = true;
  side: GPUFrontFace = 'ccw';

  private _alphaMode: AlphaMode = 'OPAQUE';
  private _doubleSided: boolean = false;
  private _vertexColors: boolean = false;
  private _vertexTangents: boolean = false;

  /**
   * glTF's alphaMode:
   *
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
    // The shader needs it too — invalidatePipeline rewrites the block.
    this.material.alphaMode = mode;
    this.invalidatePipeline();
  }

  /** Renders back faces too, with the shading normal mirrored for them. What a
   *  leaf card or a single-sided sheet of cloth needs. */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(value: boolean) {
    if (value === this._doubleSided) return;
    this._doubleSided = value;
    this.invalidatePipeline();
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
    this.invalidatePipeline();
  }

  /**
   * Shade the normal map through the geometry's own TANGENT frame rather than
   * the screen-space one the fragment shader can always reconstruct.
   */
  get vertexTangents(): boolean {
    return this._vertexTangents;
  }

  set vertexTangents(value: boolean) {
    if (value === this._vertexTangents) return;
    this._vertexTangents = value;
    this.invalidatePipeline();
  }

  /** Read by the renderer to draw transparent groups after opaque ones. */
  get transparent(): boolean {
    return this._alphaMode === 'BLEND';
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    if (this._vertexColors && !geometry.colors) return false;
    if (this._vertexTangents && !geometry.tangents) return false;
    return !!(geometry.vertices && geometry.uvs && geometry.normals);
  }

  /**
   * Position, uv, normal, then COLOR_0 and TANGENT when the material asks for
   * them. The optional two are last so their slot indices shift rather than the
   * three every standard material has — setVertexBuffers walks the same order.
   */
  protected vertexBufferLayouts(): GPUVertexBufferLayout[] {
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

    if (this._vertexTangents) {
      buffers.push({
        arrayStride: 4 * 4,
        attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }],
      });
    }

    return buffers;
  }

  /**
   * Binds what vertexBufferLayouts() declared, in the same order — the slot an
   * optional attribute lands in depends on whether the one before it is there.
   */
  protected setVertexBuffers(
    pass: GPURenderPassEncoder,
    geometry: Geometry
  ): void {
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setVertexBuffer(2, geometry.normalBuffer);

    let slot = 3;
    if (this._vertexColors) pass.setVertexBuffer(slot++, geometry.colorBuffer);
    if (this._vertexTangents)
      pass.setVertexBuffer(slot++, geometry.tangentBuffer);

    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
  }

  /**
   * What the two shader hosts substitute before compiling.
   */
  protected shaderDefines(): ShaderDefines {
    return { HAS_VERTEX_TANGENTS: this._vertexTangents };
  }

  /**
   * One entry point per vertex layout: a pipeline may only declare attributes
   * its buffers supply, so the two optional attributes are four entry points
   * over one shared body rather than flags read at runtime.
   */
  protected vertexEntryPoint(): string {
    if (this._vertexColors)
      return this._vertexTangents ? 'vsVertexColorsTangents' : 'vsVertexColors';
    return this._vertexTangents ? 'vsTangents' : 'vs';
  }

  /**
   * Only BLEND blends. Leaving it enabled for OPAQUE would be harmless while
   * alpha is forced to 1, but it is a per-fragment read-modify-write of the
   * colour target for nothing.
   */
  protected blendState(): GPUBlendState | undefined {
    if (!this.transparent) return undefined;
    return {
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
    };
  }

  protected primitiveState(): GPUPrimitiveState {
    return {
      topology: 'triangle-list',
      cullMode: this._doubleSided ? 'none' : 'back',
      frontFace: this.side,
    };
  }

  protected depthStencilState(): GPUDepthStencilState {
    return {
      // A transparent surface still tests against depth, but writing it would
      // let whichever transparent fragment happened to land first occlude the
      // ones behind it.
      depthWriteEnabled: !this.transparent,
      depthCompare: 'less',
      format: 'depth24plus',
    };
  }

  /**
   * A rebuilt pipeline hands out new bind group layouts (the layout is 'auto'),
   * so every bind group built against the old ones has to be rebuilt with it —
   * otherwise the first draw after a change fails validation. Which trackers
   * hold those bind groups is the subclass's business.
   */
  protected abstract invalidatePipeline(): void;
}
