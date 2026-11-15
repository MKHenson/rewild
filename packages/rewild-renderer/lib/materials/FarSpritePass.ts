import { Renderer } from '..';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Geometry } from '../geometry/Geometry';
import { ScatterImpostorAtlas } from '../renderers/terrain/ScatterImpostorBake';
import shader from '../shaders/scatter-far-sprite.wgsl';
import skyConstants from '../shaders/sky/skyConstants.wgsl';
import fogShader from '../shaders/sky/fog.wgsl';
import { IMaterialPass, SceneCategory } from './IMaterialPass';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { EnvironmentUniforms } from './uniforms/EnvironmentUniforms';
import { Lighting } from './uniforms/Lighting';
import { ProjModelView } from './uniforms/ProjModelView';

const spriteGroupIndex = 1;
const lightingGroupIndex = 2;
const environmentGroupIndex = 3;

/** One far sprite layer's draw: its run of the instance buffer, its atlas, and
 *  its `SpriteLayer` uniform. */
export interface FarSpriteDraw {
  first: number;
  count: number;
  atlas: ScatterImpostorAtlas;
  uniform: GPUBuffer;
}

/** What every far sprite layer reads besides its atlas. */
export interface FarSpriteSources {
  instances: GPUBuffer;
  horizonParams: GPUBuffer;
  chunkMask: GPUTexture;
  nearGround: GPUTexture;
  wideGround: GPUTexture;
  atmosphere: GPUBuffer;
}

// Trees past the chunks, as billboards over the far ground (FarSprites). Opaque
// and drawn before the horizon ring, which ranks with the water, so a sprite's
// depth is in place before the ring tests against it.
export class FarSpritePass implements IMaterialPass {
  profileCategory: SceneCategory = 'scatter';

  side: GPUFrontFace = 'ccw';
  readonly transparent = false;
  readonly doubleSided = true;
  pipeline: GPURenderPipeline;
  requiresRebuild = true;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;

  private draws: FarSpriteDraw[] = [];
  private sources: FarSpriteSources | null = null;
  private bindGroups: GPUBindGroup[] = [];

  constructor() {
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      new Lighting(lightingGroupIndex),
      new EnvironmentUniforms(environmentGroupIndex, true, true, true),
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  /** The layers to draw and what they read. Bind groups follow on the next
   *  draw. */
  setDraws(draws: FarSpriteDraw[], sources: FarSpriteSources) {
    this.draws = draws;
    this.sources = sources;
    this.bindGroups = [];
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'far sprite shader',
      code: skyConstants + fogShader + shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'far sprite pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: renderer.sceneTargets({ format: sceneColorFormat }),
      },
      multisample: { count: renderer.sampleCount },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });
    this.bindGroups = [];

    for (const uniform of this.sharedUniformsTracker.uniforms)
      uniform.requiresBuild = true;
    this.perMeshTracker.meshUniforms.forEach((uniforms) => {
      for (const uniform of uniforms) uniform.requiresBuild = true;
    });
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!(geometry.vertices && geometry.uvs);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    const sources = this.sources;
    if (!sources || this.draws.length === 0) return;

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
    if (
      !this.sharedUniformsTracker.prepareMeshUniforms(
        renderer,
        pass,
        camera,
        meshes
      )
    )
      return;
    this.perMeshTracker.prepareMeshUniforms(meshes[0], renderer, pass, camera);

    const numIndices = geometry.indices!.length;
    for (let i = 0; i < this.draws.length; i++) {
      const draw = this.draws[i];
      if (draw.count === 0) continue;
      this.bindGroups[i] ??= this.bindGroup(renderer, draw, sources);
      pass.setBindGroup(spriteGroupIndex, this.bindGroups[i]);
      pass.drawIndexed(numIndices, draw.count, 0, 0, draw.first);
    }
  }

  private bindGroup(
    renderer: Renderer,
    draw: FarSpriteDraw,
    sources: FarSpriteSources
  ): GPUBindGroup {
    const { atlas } = draw;
    return renderer.device.createBindGroup({
      label: 'far sprites',
      layout: this.pipeline.getBindGroupLayout(spriteGroupIndex),
      entries: [
        {
          binding: 0,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 1, resource: { buffer: sources.horizonParams } },
        { binding: 2, resource: sources.chunkMask.createView() },
        { binding: 3, resource: sources.nearGround.createView() },
        { binding: 4, resource: sources.wideGround.createView() },
        { binding: 5, resource: { buffer: sources.atmosphere } },
        { binding: 6, resource: { buffer: sources.instances } },
        { binding: 7, resource: atlas.sampler },
        { binding: 8, resource: atlas.albedo.createView() },
        { binding: 9, resource: atlas.normal.createView() },
        { binding: 10, resource: { buffer: atlas.params } },
        { binding: 11, resource: { buffer: draw.uniform } },
      ],
    });
  }
}
