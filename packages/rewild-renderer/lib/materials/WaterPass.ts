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
import { WaterUniforms } from './uniforms/WaterUniforms';
import { WaterType } from '../renderers/terrain/Water';

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

// One chunk's water, drawn after every opaque group and before the transparent
// ones (Renderer.organizeVisuals).
//
// Each mesh is drawn twice. The absorb draw multiplies the scene behind by the
// light that passes through the water; the light draw adds reflection and
// in-water scatter and writes depth, so the atmosphere composite fogs the water
// like terrain. The absorb pipeline binds only groups 0 and 1, so it keeps its
// own copies of those.
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

  private absorbPipeline: GPURenderPipeline;
  private absorbWaterUniforms: WaterUniforms;
  private absorbMeshUniforms = new Map<Mesh, ProjModelView>();

  constructor() {
    this.waterUniforms = new WaterUniforms(waterGroupIndex);
    this.absorbWaterUniforms = new WaterUniforms(waterGroupIndex);
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

  setTextures(surface: GPUTexture, types: GPUTexture) {
    this.waterUniforms.setTextures(surface, types);
    this.absorbWaterUniforms.setTextures(surface, types);
  }

  set palette(palette: readonly WaterType[]) {
    this.waterUniforms.palette = palette;
    this.absorbWaterUniforms.palette = palette;
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
    this.absorbWaterUniforms.destroy();
    this.absorbMeshUniforms.forEach((uniform) => uniform.destroy());
    this.absorbMeshUniforms.clear();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({ code: shader });
    const multisample = { count: renderer.sampleCount };
    const primitive: GPUPrimitiveState = {
      topology: 'triangle-list',
      cullMode: 'back',
      frontFace: this.side,
    };

    this.absorbPipeline = device.createRenderPipeline({
      label: 'water absorb pipeline',
      layout: 'auto',
      vertex: { entryPoint: 'vs', module, buffers: vertexBuffers },
      fragment: {
        entryPoint: 'fs_absorb',
        module,
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      multisample,
      primitive,
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

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
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // Both pipelines use `layout: 'auto'`, so every bind group built against
    // the old ones is invalid now.
    for (const uniform of this.sharedUniformsTracker.uniforms)
      uniform.requiresBuild = true;
    this.perMeshTracker.meshUniforms.forEach((uniforms) => {
      for (const uniform of uniforms) uniform.requiresBuild = true;
    });
    this.absorbWaterUniforms.requiresBuild = true;
    this.absorbMeshUniforms.forEach(
      (uniform) => (uniform.requiresBuild = true)
    );
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

    // Absorb first: the light draw adds on top of what it leaves.
    pass.setPipeline(this.absorbPipeline);
    const absorbWater = this.absorbWaterUniforms;
    if (absorbWater.requiresBuild)
      absorbWater.build(
        renderer,
        this.absorbPipeline.getBindGroupLayout(waterGroupIndex)
      );
    pass.setBindGroup(waterGroupIndex, absorbWater.bindGroup);
    for (const mesh of meshes) {
      const uniform = this.absorbUniformFor(mesh);
      if (uniform.requiresBuild)
        uniform.build(renderer, this.absorbPipeline.getBindGroupLayout(0));
      uniform.prepare(renderer, camera, mesh.transform);
      pass.setBindGroup(0, uniform.bindGroup);
      pass.drawIndexed(numIndices);
    }

    pass.setPipeline(this.pipeline);
    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      meshes
    );
    for (const mesh of meshes) {
      this.perMeshTracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }

  private absorbUniformFor(mesh: Mesh): ProjModelView {
    let uniform = this.absorbMeshUniforms.get(mesh);
    if (!uniform) {
      uniform = new ProjModelView(0);
      this.absorbMeshUniforms.set(mesh, uniform);
    }
    return uniform;
  }
}
