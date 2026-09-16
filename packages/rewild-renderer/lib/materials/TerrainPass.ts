import { Geometry } from '../geometry/Geometry';
import { IMaterialPass, SceneCategory } from './IMaterialPass';
import shader from '../shaders/terrain.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { TerrainUniforms } from './uniforms/TerrainUniforms';
import {
  terrainDetailFade,
  terrainShaderDefines,
} from '../renderers/terrain/TerrainQuality';
import { RenderQuality } from '../utils/RenderQuality';
import { composeShader } from '../utils/shaderDefines';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';

const sharedBindgroupIndex = 1;
const lightingGroupIndex = 2;
const shadowGroupIndex = 3;

export class TerrainPass implements IMaterialPass {
  profileCategory: SceneCategory = 'terrain';

  side: GPUFrontFace;
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  terrainUniforms: TerrainUniforms;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.terrainUniforms = new TerrainUniforms(sharedBindgroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.shadowUniforms = new ShadowUniforms(shadowGroupIndex, true);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.terrainUniforms,
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  /** Tier the current pipeline was built against. Compared each draw so a
   *  change to the setting rebuilds rather than being silently ignored. */
  private builtQuality: RenderQuality | null = null;

  /**
   * Rebuild the pipeline, and every bind group built against its layout.
   *
   * The pipeline uses `layout: 'auto'`, so a rebuild mints a fresh
   * GPUBindGroupLayout that the existing bind groups do not belong to. Flagging
   * the uniforms is what stops the next draw binding groups from the pipeline
   * that no longer exists. Mirrors StandardPass.invalidatePipeline.
   */
  private invalidatePipeline(): void {
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

    // Terrain is the largest single item in the frame once foliage is dealt
    // with, and none of the other aspects touch it. See TerrainQuality.
    const quality = renderer.quality.aspect('terrain');
    this.builtQuality = quality;

    // Distances, unlike the loop bounds, are uniforms and need no rebuild.
    const fade = terrainDetailFade(quality);
    this.terrainUniforms.detailFadeStart = fade.start;
    this.terrainUniforms.detailFadeEnd = fade.end;

    const module = device.createShaderModule({
      code: composeShader([shader], terrainShaderDefines(quality)),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'terrain render pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [
              {
                // uv
                shaderLocation: 1,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                // normal
                shaderLocation: 2,
                offset: 0,
                format: 'float32x3',
              },
            ],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: sceneColorFormat,
          },
        ],
      },
      multisample: {
        count: renderer.sampleCount,
      },
      primitive: {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
        frontFace: this.side,
      },
      // Enable depth testing so that the fragment closest to the camera
      // is rendered in front.
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
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
    // The tier bakes loop bounds into the shader, so only a rebuild can apply a
    // change. Renderer.renderGroupings picks this up before the next draw.
    if (renderer.quality.aspect('terrain') !== this.builtQuality) {
      this.invalidatePipeline();
      return;
    }

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
    pass.setVertexBuffer(2, geometry.normalBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

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
