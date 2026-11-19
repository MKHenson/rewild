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
import { EnvironmentUniforms } from './uniforms/EnvironmentUniforms';
import {
  placeTerrainPatch,
  TerrainPatchPlacement,
} from '../renderers/terrain/TerrainPatch';

const sharedBindgroupIndex = 1;
const lightingGroupIndex = 2;
const environmentGroupIndex = 3;

/**
 * `chunk` draws a chunk's mesh; `patch` draws the displaced grid around the
 * eye over a chunk pass's bindings, with no vertex buffers.
 */
export type TerrainPassMode = 'chunk' | 'patch';

export class TerrainPass implements IMaterialPass {
  profileCategory: SceneCategory = 'terrain';

  side: GPUFrontFace;
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  terrainUniforms: TerrainUniforms;
  lightingUniforms: Lighting;
  environmentUniforms: EnvironmentUniforms;

  readonly mode: TerrainPassMode;

  /**
   * Samples per side of the chunk mesh this pass draws, when it is a LOD-0
   * mesh and so can carry the displaced patch; 0 otherwise.
   */
  patchSamples = 0;
  patchMetresPerSample = 0;

  readonly patchPlacement = new TerrainPatchPlacement();
  private patch: TerrainPass | null = null;
  private patchSurface: GPUBuffer | null = null;
  // The chunk geometry patchSurface was written from. A re-mesh swaps the
  // chunk's geometry in place, so the surface is rewritten when it changes.
  private patchSurfaceFrom: Geometry | null = null;
  private patchCopiedFrom: GPUBindGroup | null = null;
  private patchTracked = false;
  private patchWritten = false;

  constructor(mode: TerrainPassMode = 'chunk') {
    this.mode = mode;
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.terrainUniforms = new TerrainUniforms(sharedBindgroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.environmentUniforms = new EnvironmentUniforms(
      environmentGroupIndex,
      true,
      true
    );
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.terrainUniforms,
      this.lightingUniforms,
      this.environmentUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
    this.patch?.dispose();
    this.patch = null;
    this.patchSurface?.destroy();
    this.patchSurface = null;
    this.patchSurfaceFrom = null;
  }

  /**
   * Places the displaced patch around the eye on this chunk, or clears it
   * where it misses. A no-op on a pass with no LOD-0 surface to displace.
   *
   *     pass.updatePatch(device, eye.x, eye.z, 32, 0.08, chunk.x, chunk.z, 240);
   */
  updatePatch(
    device: GPUDevice,
    eyeX: number,
    eyeZ: number,
    size: number,
    spacing: number,
    chunkX: number,
    chunkZ: number,
    chunkHalf: number
  ): void {
    if (this.patchSamples <= 0) return;
    const placement = this.patchPlacement;
    if (
      !placeTerrainPatch(
        eyeX,
        eyeZ,
        size,
        spacing,
        chunkX,
        chunkZ,
        chunkHalf,
        placement
      )
    ) {
      this.clearPatch(device);
      return;
    }
    if (!this.patch) this.patch = new TerrainPass('patch');
    const metres = this.patchMetresPerSample;
    this.terrainUniforms.setPatch(device, placement, metres);
    this.patch.terrainUniforms.setPatch(device, placement, metres);
    this.patch.patchPlacement.cellsX = placement.cellsX;
    this.patch.patchPlacement.cellsZ = placement.cellsZ;
    this.patchWritten = true;
  }

  /** Takes the displaced patch off this chunk. */
  clearPatch(device: GPUDevice): void {
    this.patchPlacement.active = false;
    if (!this.patchWritten) return;
    this.patchWritten = false;
    this.terrainUniforms.setPatch(device, null, 0);
    this.patch?.terrainUniforms.setPatch(device, null, 0);
  }

  /** Tier the current pipeline was built against. Compared each draw so a
   *  change to the setting rebuilds rather than being silently ignored. */
  private builtQuality: RenderQuality | null = null;
  /** Whether the current pipeline was built with the chunk fade's discard. */
  private builtFade = false;

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
    this.builtFade = this.wantsFade();

    // Distances, unlike the loop bounds, are uniforms and need no rebuild.
    const fade = terrainDetailFade(quality);
    this.terrainUniforms.detailFadeStart = fade.start;
    this.terrainUniforms.detailFadeEnd = fade.end;

    const isPatch = this.mode === 'patch';
    const module = device.createShaderModule({
      code: composeShader([shader], {
        ...terrainShaderDefines(quality),
        HAS_TERRAIN_FADE: this.builtFade && !isPatch,
      }),
    });

    this.pipeline = device.createRenderPipeline({
      label: isPatch ? 'terrain patch pipeline' : 'terrain render pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: isPatch ? 'vsPatch' : 'vs',
        module,
        buffers: isPatch ? [] : [
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
        targets: renderer.sceneTargets(
          {
            format: sceneColorFormat,
          },
          true
        ),
      },
      multisample: {
        count: renderer.sampleCount,
      },
      primitive: {
        topology: isPatch ? 'triangle-strip' : 'triangle-list',

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

  /**
   * Sets the chunk's fade. A shader that can discard costs the hardware its
   * early depth test, so only a fading chunk's carries the discard: crossing
   * into or out of a fade rebuilds the pipeline, before the frame's draw.
   */
  setFade(device: GPUDevice, fade: number): void {
    this.terrainUniforms.setFade(device, fade);
    if (!this.requiresRebuild && this.wantsFade() !== this.builtFade)
      this.invalidatePipeline();
  }

  private wantsFade(): boolean {
    return this.terrainUniforms.fade < 1;
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

    // Drawn after the chunk so it is bound last; a fading chunk's discard
    // would leave holes the patch does not share, so it waits for the fade.
    const patch = this.patch;
    if (patch && this.patchPlacement.active && this.terrainUniforms.fade >= 1)
      for (const mesh of meshes)
        patch.renderPatch(renderer, pass, camera, mesh, geometry, this);
  }

  /** Draws this patch pass's grid over `chunk`'s mesh and bindings. */
  private renderPatch(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    mesh: Mesh,
    geometry: Geometry,
    chunk: TerrainPass
  ): void {
    if (
      this.requiresRebuild ||
      renderer.quality.aspect('terrain') !== this.builtQuality
    ) {
      this.invalidatePipeline();
      this.init(renderer);
    }

    if (!this.patchSurface) {
      this.patchSurface = buildPatchSurface(
        renderer.device,
        geometry,
        chunk.patchSamples
      );
      this.patchSurfaceFrom = geometry;
      this.terrainUniforms.patchSurface = this.patchSurface;
    } else if (this.patchSurfaceFrom !== geometry) {
      renderer.device.queue.writeBuffer(
        this.patchSurface,
        0,
        packPatchSurface(geometry, chunk.patchSamples)
      );
      this.patchSurfaceFrom = geometry;
    }

    const source = chunk.terrainUniforms;
    if (this.patchCopiedFrom !== source.bindGroup) {
      this.terrainUniforms.copyFrom(source);
      this.patchCopiedFrom = source.bindGroup;
    }

    if (!this.patchTracked) {
      this.sharedUniformsTracker.onAssignedToMesh(mesh);
      this.perMeshTracker.onAssignedToMesh(mesh);
      this.patchTracked = true;
    }

    pass.setPipeline(this.pipeline);
    if (
      !this.sharedUniformsTracker.prepareMeshUniforms(
        renderer,
        pass,
        camera,
        this.sharedUniformsTracker.meshes
      )
    )
      return;
    this.perMeshTracker.prepareMeshUniforms(mesh, renderer, pass, camera);

    const placement = this.patchPlacement;
    pass.draw(2 * (placement.cellsX + 1), placement.cellsZ);
  }
}

/**
 * The chunk mesh's surface vertices as one vec4f (height, normal) each, which
 * is what the patch's vertex shader interpolates its base from.
 */
function buildPatchSurface(
  device: GPUDevice,
  geometry: Geometry,
  samples: number
): GPUBuffer {
  const data = packPatchSurface(geometry, samples);
  const buffer = device.createBuffer({
    label: 'terrain patch surface',
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function packPatchSurface(
  geometry: Geometry,
  samples: number
): Float32Array<ArrayBuffer> {
  const count = samples * samples;
  const vertices = geometry.vertices!;
  const normals = geometry.normals!;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = vertices[i * 3 + 1];
    data[i * 4 + 1] = normals[i * 3];
    data[i * 4 + 2] = normals[i * 3 + 1];
    data[i * 4 + 3] = normals[i * 3 + 2];
  }
  return data;
}
