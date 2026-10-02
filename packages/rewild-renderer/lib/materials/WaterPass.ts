import { Geometry } from '../geometry/Geometry';
import { IMaterialPass, SceneCategory } from './IMaterialPass';
import shader from '../shaders/water.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import {
  WaterGridPlacement,
  WaterUniforms,
} from './uniforms/WaterUniforms';
import { WaterType } from '../renderers/terrain/Water';
import { composeShader } from '../utils/shaderDefines';

const waterGroupIndex = 1;
const lightingGroupIndex = 2;
const shadowGroupIndex = 3;

const vertexBuffers: GPUVertexBufferLayout[] = [
  {
    arrayStride: 4 * 3,
    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
  },
  {
    arrayStride: 4 * 2,
    attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
  },
];

// A draw that binds only groups 0 and 1. `layout: 'auto'` gives every pipeline
// bind group layouts of its own, so each such draw keeps its own copies.
class WaterSubPass {
  pipeline: GPURenderPipeline;
  readonly water: WaterUniforms;
  private meshUniforms = new Map<Mesh, ProjModelView>();

  constructor(refracts = false, shades = false) {
    this.water = new WaterUniforms(waterGroupIndex, refracts, shades);
  }

  setPipeline(pipeline: GPURenderPipeline) {
    this.pipeline = pipeline;
    this.water.requiresBuild = true;
    this.meshUniforms.forEach((uniform) => (uniform.requiresBuild = true));
  }

  draw(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    numIndices: number
  ) {
    pass.setPipeline(this.pipeline);
    if (this.water.requiresBuild || this.water.isStale(renderer))
      this.water.build(
        renderer,
        this.pipeline.getBindGroupLayout(waterGroupIndex)
      );
    pass.setBindGroup(waterGroupIndex, this.water.bindGroup);
    for (const mesh of meshes) {
      let uniform = this.meshUniforms.get(mesh);
      if (!uniform) {
        uniform = new ProjModelView(0);
        this.meshUniforms.set(mesh, uniform);
      }
      if (uniform.requiresBuild)
        uniform.build(renderer, this.pipeline.getBindGroupLayout(0));
      uniform.prepare(renderer, camera, mesh.transform);
      pass.setBindGroup(0, uniform.bindGroup);
      pass.drawIndexed(numIndices);
    }
  }

  dispose() {
    this.water.destroy();
    this.meshUniforms.forEach((uniform) => uniform.destroy());
    this.meshUniforms.clear();
  }
}

// One chunk's water, drawn after every opaque group and before the transparent
// ones, nearest chunk first (Renderer.organizeVisuals).
//
// Each mesh is drawn three times. The depth draw writes the surface's depth
// alone. The waves fold the surface over itself on screen, a crest in front of
// the slope behind it, so the absorb and light draws then shade only where the
// depth is equal: the nearest layer, whatever order the triangles come in. The
// absorb draw replaces the scene behind with the refracted scene
// (Renderer.refraction) times the light that passes through the water; the
// light draw adds reflection and in-water scatter. The depth stays
// for the atmosphere composite, which fogs the water like terrain.
export class WaterPass implements IMaterialPass {
  profileCategory: SceneCategory = 'water';

  side: GPUFrontFace = 'ccw';
  /** The light pipeline; the one the trackers build against. */
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean = true;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;
  waterUniforms: WaterUniforms;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;

  private depth = new WaterSubPass();
  private absorb = new WaterSubPass(true, true);

  constructor() {
    this.waterUniforms = new WaterUniforms(waterGroupIndex, true, true);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.shadowUniforms = new ShadowUniforms(shadowGroupIndex, true);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.waterUniforms,
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  private get allWaterUniforms(): WaterUniforms[] {
    return [this.waterUniforms, this.depth.water, this.absorb.water];
  }

  setTextures(surface: GPUTexture, types: GPUTexture) {
    for (const water of this.allWaterUniforms)
      water.setTextures(surface, types);
  }

  set palette(palette: readonly WaterType[]) {
    for (const water of this.allWaterUniforms) water.palette = palette;
  }

  set grid(grid: WaterGridPlacement) {
    for (const water of this.allWaterUniforms) water.grid = grid;
  }

  set wavesBuffer(buffer: GPUBuffer) {
    for (const water of this.allWaterUniforms) water.wavesBuffer = buffer;
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
    this.depth.dispose();
    this.absorb.dispose();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      code: composeShader([shader], {}),
    });
    const multisample = { count: renderer.sampleCount };
    const primitive: GPUPrimitiveState = {
      topology: 'triangle-list',
      // Both faces: the underside is the surface seen from below. Each draw
      // keeps the side the camera is on (water.wgsl facesCamera).
      cullMode: 'none',
      frontFace: this.side,
    };
    // Shading only where the depth draw left the nearest layer. The position
    // is @invariant in the shader, so all three pipelines agree on it exactly.
    const shadeDepth: GPUDepthStencilState = {
      depthWriteEnabled: false,
      depthCompare: 'equal',
      format: 'depth24plus',
    };

    this.depth.setPipeline(
      device.createRenderPipeline({
        label: 'water depth pipeline',
        layout: 'auto',
        vertex: { entryPoint: 'vs', module, buffers: vertexBuffers },
        fragment: {
          entryPoint: 'fs_depth',
          module,
          targets: [{ format: sceneColorFormat, writeMask: 0 }],
        },
        multisample,
        primitive,
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less',
          format: 'depth24plus',
        },
      })
    );

    this.absorb.setPipeline(
      device.createRenderPipeline({
        label: 'water absorb pipeline',
        layout: 'auto',
        vertex: { entryPoint: 'vs', module, buffers: vertexBuffers },
        fragment: {
          entryPoint: 'fs_absorb',
          module,
          targets: [
            {
              format: sceneColorFormat,
              // Alpha is the water's coverage: its edge fades to the scene.
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
              },
            },
          ],
        },
        multisample,
        primitive,
        depthStencil: shadeDepth,
      })
    );

    this.pipeline = device.createRenderPipeline({
      label: 'water light pipeline',
      layout: 'auto',
      vertex: { entryPoint: 'vs', module, buffers: vertexBuffers },
      fragment: {
        entryPoint: 'fs_light',
        module,
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      multisample,
      primitive,
      depthStencil: shadeDepth,
    });

    // Every pipeline uses `layout: 'auto'`, so every bind group built against
    // the old ones is invalid now.
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
    const numIndices = geometry.indices!.length;
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    this.depth.draw(renderer, pass, camera, meshes, numIndices);
    // Absorb before light: the light draw adds on top of what it leaves.
    this.absorb.draw(renderer, pass, camera, meshes, numIndices);

    pass.setPipeline(this.pipeline);
    if (this.waterUniforms.isStale(renderer))
      this.waterUniforms.requiresBuild = true;
    if (
      !this.sharedUniformsTracker.prepareMeshUniforms(
        renderer,
        pass,
        camera,
        meshes
      )
    )
      return;
    for (const mesh of meshes) {
      this.perMeshTracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }
}
