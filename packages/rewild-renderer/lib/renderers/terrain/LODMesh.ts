import { Vector2 } from 'rewild-common';
import { TerrainPass } from '../../materials/TerrainPass';
import { Mesh } from '../../core/Mesh';
import { Renderer } from '../..';
import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';
import { Geometry } from '../../geometry/Geometry';
import type { TerrainChunk } from './TerrainChunk';

export type LODMeshGPUState = 'none' | 'requested' | 'ready' | 'unloaded';

// One detail level of a terrain chunk: owns the worker request for its mesh
// and the resulting GPU resources. The heights it meshes come from the chunk
// (in-memory edits or a saved snapshot) or are generated in the worker.
export class LODMesh {
  mesh: Mesh;
  lod: i32;
  position: Vector2;
  gpuState: LODMeshGPUState;
  chunk: TerrainChunk;
  chunkSize: i32;
  heights: Float32Array;
  seed: number;
  climatePreset: string;

  constructor(
    lod: i32,
    chunk: TerrainChunk,
    position: Vector2,
    chunkSize: i32,
    seed: number,
    climatePreset: string
  ) {
    this.lod = lod;
    this.gpuState = 'none';
    this.chunk = chunk;
    this.chunkSize = chunkSize;
    this.position = position;
    this.seed = seed;
    this.climatePreset = climatePreset;
  }

  requestMesh(renderer: Renderer) {
    if (this.gpuState === 'unloaded') {
      this.reuploadGPU(renderer);
      return;
    }
    if (this.gpuState !== 'none') return;
    this.gpuState = 'requested';
    this.load(this.chunkSize, this.lod, renderer);
  }

  unloadGPU() {
    if (this.gpuState !== 'ready') return;
    this.mesh.geometry.dispose();
    this.mesh.transform.visible = false;
    this.gpuState = 'unloaded';
  }

  private async reuploadGPU(renderer: Renderer) {
    this.gpuState = 'requested';
    this.mesh.geometry.build(
      renderer.device,
      renderer.bvhConfig,
      renderer.bvhWorkerManager ?? undefined
    );
    this.mesh.transform.visible = true;
    this.gpuState = 'ready';
    this.chunk.dispatcher.dispatch({
      type: 'mesh-loaded',
      mesh: this,
      chunk: this.chunk,
    });
  }

  async load(chunkSize: i32, lod: i32, renderer: Renderer) {
    const terrainRenderer = renderer.terrainRenderer;

    // Known heights (in-memory or saved snapshot) ⇒ the worker meshes them,
    // skipping generation; absent ⇒ it generates from the recipe as before.
    const knownHeights = await this.chunk.resolveHeights(
      terrainRenderer.snapshotProvider
    );
    const { texture, vertices, uvs, normals, indices, heights } =
      await terrainRenderer.workerPool.enqueue({
        chunkSize,
        lod,
        position: this.position,
        seed: this.seed,
        climatePreset: this.climatePreset,
        heights: knownHeights ?? undefined,
      });

    // Cache the heightfield on the chunk so later LODs, snapshot writes, and
    // sculpting all work from the same in-memory truth. Never clobber heights
    // that appeared while this request was in flight (an edit wins).
    if (!this.chunk.heights) this.chunk.setHeights(heights);

    const terrainTexture = renderer.textureManager.addTexture(
      new DataTexture(
        new TextureProperties('terrain1', false),
        texture,
        chunkSize,
        chunkSize
      )
    );

    const geometry = new Geometry();
    geometry.vertices = vertices;
    geometry.normals = normals; // pre-computed in worker using main-mesh triangles only
    geometry.uvs = uvs;
    geometry.indices = indices;

    this.heights = new Float32Array(vertices.length / 3);
    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
      this.heights[j] = vertices[i + 1];
    }

    terrainTexture.load(renderer);
    geometry.build(
      renderer.device,
      renderer.bvhConfig,
      renderer.bvhWorkerManager ?? undefined
    );

    const terrainPass = new TerrainPass();
    terrainPass.terrainUniforms.sampler =
      renderer.samplerManager.get('linear-clamped');
    terrainPass.terrainUniforms.texture = terrainTexture.gpuTexture;
    terrainPass.terrainUniforms.albedoTexture = renderer.textureManager.get(
      'rocky-mountain-texture-seamless'
    ).gpuTexture;
    terrainPass.terrainUniforms.normalMap = renderer.textureManager.get(
      'rocky-mountain-texture-seamless-normal'
    ).gpuTexture;
    terrainPass.terrainUniforms.shininess = 5;

    this.mesh = new Mesh(geometry, terrainPass);
    this.chunk.transform.addChild(this.mesh.transform);
    // This mesh arrives mid-frame from a worker; until the next render pass
    // its matrixWorld is identity, which would place the chunk's geometry at
    // the world origin. A pointer-event raycast landing in that window (e.g.
    // the orbit controller's terrain clamp) would hit phantom terrain, so
    // compute the world matrix immediately.
    this.mesh.transform.updateWorldMatrix(true, false);
    this.gpuState = 'ready';
    this.chunk.dispatcher.dispatch({
      type: 'mesh-loaded',
      mesh: this,
      chunk: this.chunk,
    });
  }
}
