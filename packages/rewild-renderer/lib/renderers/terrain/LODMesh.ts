import { Vector2 } from 'rewild-common';
import { TerrainPass } from '../../materials/TerrainPass';
import { Mesh } from '../../core/Mesh';
import { Renderer } from '../..';
import { Geometry } from '../../geometry/Geometry';
import { resolveClimatePreset } from './Biomes';
import {
  TERRAIN_ALBEDO_ARRAY,
  TERRAIN_NORMAL_ARRAY,
  TERRAIN_ARM_ARRAY,
  TERRAIN_HEIGHT_ARRAY,
  getClimateLayerParams,
} from './TerrainTextureArrays';
import type { TerrainChunk } from './TerrainChunk';

export type LODMeshGPUState = 'none' | 'requested' | 'ready' | 'unloaded';

// Terrain BVH policy. Trees exist only for raycasting (picking, sculpting,
// the orbit ground clamp), which happens at close range — so only the two
// nearest LODs get one, and with editor-picking leaf density rather than the
// engine default of 8 tris/leaf. The default policy (every LOD, 8/leaf) put
// ~2.7M BVH nodes (~4 heap objects each) on an idle scene. Far LODs raycast
// brute-force; the bounding-sphere pre-check keeps that cheap for the couple
// of chunks a ray actually crosses.
const TERRAIN_BVH_MAX_LOD = 1;
const TERRAIN_BVH_LEAF_TRIANGLES = 32;

// One detail level of a terrain chunk: owns the worker request for its mesh
// and the resulting GPU resources. The heights it meshes come from the chunk
// (in-memory edits or a saved snapshot) or are generated in the worker.
//
// Edits (sculpting, snapshot writes) bump the chunk's heightsVersion; refresh()
// then rebuilds this LOD *in the background* and swaps the new mesh in only
// when it is ready, so the chunk never blinks out mid-stroke. Rebuild requests
// arriving while one is in flight coalesce into a single follow-up build.
export class LODMesh {
  mesh: Mesh;
  lod: i32;
  // Sample-space noise offset for this chunk (coord * (chunkSize-1)); handed to
  // the worker to generate heights/splat. Not a world position — chunk
  // placement is the TerrainChunk transform (see TerrainChunk.noiseOffset).
  noiseOffset: Vector2;
  gpuState: LODMeshGPUState;
  chunk: TerrainChunk;
  chunkSize: i32;
  seed: number;
  climatePreset: string;
  // chunk.heightsVersion the current mesh was built from.
  private builtVersion = -1;
  private building = false;

  constructor(
    lod: i32,
    chunk: TerrainChunk,
    noiseOffset: Vector2,
    chunkSize: i32,
    seed: number,
    climatePreset: string
  ) {
    this.lod = lod;
    this.gpuState = 'none';
    this.chunk = chunk;
    this.chunkSize = chunkSize;
    this.noiseOffset = noiseOffset;
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
    this.build(renderer);
  }

  // The chunk's heights changed — make this LOD reflect them without a blink.
  refresh(renderer: Renderer) {
    switch (this.gpuState) {
      case 'none':
        // Nothing built yet; the next requestMesh() uses the current heights.
        return;
      case 'requested':
        // The in-flight build notices the version bump and re-runs.
        return;
      case 'unloaded': {
        // Nothing on screen and the CPU geometry is now stale — throw it away
        // and rebuild on demand instead of re-uploading stale data. The chunk's
        // texture is left alone: it is shared with sibling LODs and refreshed
        // by whichever build lands next.
        if (this.mesh) {
          this.mesh.material.dispose();
          this.mesh.transform.removeFromParent();
          this.mesh = undefined as never;
        }
        this.builtVersion = -1;
        this.gpuState = 'none';
        return;
      }
      case 'ready':
        // Rebuild in the background; the old mesh stays visible until the
        // replacement is committed.
        this.build(renderer);
    }
  }

  unloadGPU() {
    if (this.gpuState !== 'ready') return;
    // GPU buffers only — CPU data and the BVH stay so reuploadGPU() can
    // bring this LOD back without rebuilding anything.
    this.mesh.geometry.unloadBuffers();
    this.mesh.transform.visible = false;
    this.gpuState = 'unloaded';
  }

  // Full teardown (chunk eviction/reset): releases GPU geometry and uniform
  // buffers
  dispose() {
    if (this.mesh) {
      if (this.gpuState === 'ready') this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh.transform.removeFromParent();
    }
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
    // Heights may have changed while this LOD sat unloaded with its meshes
    // still cached — catch up now that it is visible again.
    if (this.builtVersion !== this.chunk.heightsVersion) this.build(renderer);
  }

  // Builds (or rebuilds) this LOD's mesh from the chunk's current heights and
  // swaps it in atomically. Loops until the mesh matches the latest
  // heightsVersion, so any number of edits during a build coalesce into at
  // most one follow-up build.
  private async build(renderer: Renderer) {
    if (this.building) return;
    this.building = true;
    try {
      do {
        const swapping = this.gpuState === 'ready';

        // Known heights (in-memory or saved snapshot) ⇒ the worker meshes
        // them, skipping generation; absent ⇒ it generates from the recipe.
        const knownHeights = await this.chunk.resolveHeights(
          renderer.terrainRenderer.snapshotProvider
        );
        // The chunk's painted biome mask (loading it on first use, exactly like
        // the height snapshot). Splat-only — it never reaches the height paths.
        const climate = resolveClimatePreset(this.climatePreset);
        const biomeMask = await this.chunk.resolveBiomeMask(
          renderer.terrainRenderer.biomeMaskProvider,
          climate.biomes.length
        );
        const version = this.chunk.heightsVersion;
        const maskVersion = this.chunk.maskVersion;

        // Edited surfaces diverge from the worker's noise apron ring, so build a
        // real apron from the loaded neighbours' heights on the main thread and
        // hand it over — the worker shades edges two-sided against it, matching
        // the neighbour. It carries the inner heights too, so `heights` is
        // omitted to avoid transferring the field twice. If the apron can't be
        // built (no heights yet), `edited` makes the worker fall back to
        // one-sided edges rather than the mismatched noise ring.
        const apron =
          this.chunk.heightsAreEdited && knownHeights
            ? renderer.terrainRenderer.buildApron(
                knownHeights,
                this.chunk.coord
              )
            : undefined;

        // Scatter rides whichever LOD build gets there first — the instances
        // are chunk state, identical for every LOD, so only one build pays.
        const wantsScatter = this.chunk.needsScatter(version);

        const { splat, vertices, uvs, normals, indices, heights, scatter } =
          await renderer.terrainRenderer.workerPool.enqueue({
            chunkSize: this.chunkSize,
            lod: this.lod,
            position: this.noiseOffset,
            seed: this.seed,
            climatePreset: this.climatePreset,
            heights: apron ? undefined : knownHeights ?? undefined,
            apron,
            edited: this.chunk.heightsAreEdited,
            biomeMask: biomeMask ?? undefined,
            scatter: wantsScatter,
          });

        // Cache the heightfield on the chunk so later LODs, snapshot writes,
        // and sculpting all work from the same in-memory truth. A no-op if a
        // sibling LOD got there first — its baseline is identical to ours, so
        // this mesh still reflects `version`, and only a real edit (which
        // bumps the version) makes us rebuild below.
        this.chunk.populateHeights(heights);

        // The chunk was evicted/disposed while the worker ran — drop the
        // result instead of resurrecting GPU state.
        if (
          this.chunk.disposed ||
          this.gpuState !== (swapping ? 'ready' : 'requested')
        ) {
          if (wantsScatter) this.chunk.cancelScatterRequest();
          return;
        }

        // The splat map is chunk state shared by every LOD — hand it over and
        // let the chunk create or re-upload it as its version warrants.
        this.chunk.populateSplat(renderer, splat, version);

        if (wantsScatter)
          this.chunk.populateScatter(
            renderer,
            renderer.terrainRenderer,
            scatter,
            version
          );

        // A paint stamp landed while this build was in the worker, so the splat
        // it just produced is already one stroke stale. Painting bumps only
        // maskVersion (no geometry changed), so the do-while below will not
        // catch this — regenerate the splat alone, in place, right here.
        if (this.chunk.maskVersion !== maskVersion) {
          renderer.terrainRenderer.refreshChunkSplat(
            this.chunk.coord.x,
            this.chunk.coord.y
          );
        }

        const oldMesh = swapping ? this.mesh : null;

        const geometry = new Geometry();
        geometry.vertices = vertices;
        geometry.normals = normals; // pre-computed in worker using main-mesh triangles only
        geometry.uvs = uvs;
        geometry.indices = indices;
        geometry.autoComputeBVH = false; // BVH policy is per-LOD, below

        // A re-mesh preserves topology (same grid and skirt ordering — only
        // heights moved), so the new geometry inherits the old mesh's BVH
        // with a cheap in-place refit. Queueing a full worker rebuild per
        // sculpt stamp instead floods the single BVH worker: the backlog
        // retains every superseded geometry and materializes millions of
        // BVH nodes, running the tab out of memory.
        const oldBvh = oldMesh?.geometry.bvh;
        if (
          oldBvh?.isReady &&
          oldMesh!.geometry.vertices.length === vertices.length &&
          oldMesh!.geometry.indices?.length === indices.length
        ) {
          oldBvh.rebind(vertices);
          geometry.bvh = oldBvh;
        }

        geometry.build(
          renderer.device,
          renderer.bvhConfig,
          renderer.bvhWorkerManager ?? undefined
        );

        const bvhConfig = renderer.bvhConfig;
        if (
          !geometry.bvh &&
          this.lod <= TERRAIN_BVH_MAX_LOD &&
          bvhConfig?.autoComputeGeometryBVH
        ) {
          const bvhOptions = {
            strategy: bvhConfig.geometryBVHStrategy,
            maxDepth: bvhConfig.geometryBVHMaxDepth,
            maxLeafTriangles: TERRAIN_BVH_LEAF_TRIANGLES,
          };
          if (renderer.bvhWorkerManager) {
            geometry.computeBVHAsync(
              renderer.bvhWorkerManager,
              bvhOptions,
              bvhConfig.asyncBuildThreshold
            );
          } else {
            geometry.computeBVH(bvhOptions);
          }
        }

        const terrainPass = new TerrainPass();
        const uniforms = terrainPass.terrainUniforms;
        uniforms.splatSampler = renderer.samplerManager.get('linear-clamped');
        uniforms.splatTexture = this.chunk.splatTexture!.gpuTexture;
        uniforms.splatTextureExt = this.chunk.splatTextureExt!.gpuTexture;
        uniforms.albedoView = renderer.textureManager
          .get(TERRAIN_ALBEDO_ARRAY)
          .gpuTexture.createView({ dimension: '2d-array' });
        uniforms.normalView = renderer.textureManager
          .get(TERRAIN_NORMAL_ARRAY)
          .gpuTexture.createView({ dimension: '2d-array' });
        uniforms.armView = renderer.textureManager
          .get(TERRAIN_ARM_ARRAY)
          .gpuTexture.createView({ dimension: '2d-array' });
        uniforms.heightView = renderer.textureManager
          .get(TERRAIN_HEIGHT_ARRAY)
          .gpuTexture.createView({ dimension: '2d-array' });
        // Which material each splat channel means, and how to sample it.
        // (Gloss now rides in these per-layer params, not a global shininess.)
        uniforms.layers = getClimateLayerParams(
          resolveClimatePreset(this.climatePreset)
        );

        const newMesh = new Mesh(geometry, terrainPass);
        this.mesh = newMesh;
        this.chunk.transform.addChild(newMesh.transform);
        // This mesh arrives mid-frame from a worker; until the next render
        // pass its matrixWorld is identity, which would place the chunk's
        // geometry at the world origin. A pointer-event raycast landing in
        // that window (e.g. the orbit controller's terrain clamp) would hit
        // phantom terrain, so compute the world matrix immediately.
        newMesh.transform.updateWorldMatrix(true, false);

        if (oldMesh) {
          // Keep whatever visibility the old mesh had so the swap is
          // invisible; the next visibility update re-evaluates it anyway.
          newMesh.visible = oldMesh.visible;
          newMesh.transform.visible = oldMesh.transform.visible;
          oldMesh.geometry.dispose();
          oldMesh.material.dispose();
          oldMesh.transform.removeFromParent();
        }

        this.builtVersion = version;
        this.gpuState = 'ready';
        this.chunk.dispatcher.dispatch({
          type: 'mesh-loaded',
          mesh: this,
          chunk: this.chunk,
        });
      } while (
        !this.chunk.disposed &&
        this.builtVersion !== this.chunk.heightsVersion
      );
    } finally {
      this.building = false;
    }
  }
}
