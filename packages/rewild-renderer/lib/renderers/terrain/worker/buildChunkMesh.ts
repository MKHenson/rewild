import { generateTerrainMesh, MESH_STRIDE } from '../MeshGenerator';
import { generateBiomeBlendedHeightMap } from '../Noise';
import { resolveClimatePreset } from '../Biomes';
import { generateSplatMap } from '../Splat';
import { Vector2 } from 'rewild-common';

export interface BuildChunkMeshRequest {
  chunkSize: number;
  lod: number;
  position: { x: number; y: number };
  seed: number;
  climatePreset: string;
  // LOD-0 heights from a saved chunk snapshot. Present ⇒ mesh these heights
  // and skip generation entirely; absent ⇒ generate from the recipe.
  heights?: Float32Array;
}

export interface BuildChunkMeshResult {
  // RGBA8 splat map: channel i is the weight of the climate palette's i-th
  // material. Chunk-wide and identical for every LOD.
  splat: Uint8Array;
  vertices: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  // The full LOD-0 heightfield the mesh was built from (generated or provided).
  // Returned so the main thread can keep the chunk's current heights in memory
  // — the capture source for snapshot writes (#174) and sculpting (#175).
  heights: Float32Array;
}

// Shared by the terrain worker and tests. Everything downstream of the height
// array (colour bands, per-LOD downsampling, normals) is identical whether the
// heights were generated or loaded from a snapshot — the height source is the
// only branch.
export function buildChunkMesh(
  request: BuildChunkMeshRequest
): BuildChunkMeshResult {
  const { chunkSize, lod, position, seed, climatePreset } = request;

  // Heights in absolute world meters. Which biome shapes each sample comes from
  // the temperature × moisture climate model of the world's climate preset —
  // presets are code-defined game content (Biomes.ts); worlds carry only the id.
  const climate = resolveClimatePreset(climatePreset);
  const worldOffset = new Vector2(position.x, position.y);
  const heights =
    request.heights ??
    generateBiomeBlendedHeightMap(
      chunkSize,
      chunkSize,
      seed,
      worldOffset,
      climate
    );

  // Per-biome material weights, derived from the same climate model that shaped
  // the heights plus each biome's slope/height layer rules. Derived rather than
  // stored, so it is correct for generated and sculpted chunks alike.
  const splat = generateSplatMap(
    chunkSize,
    chunkSize,
    seed,
    worldOffset,
    climate,
    heights
  );

  // Heights are already in meters, so no further vertical scaling.
  const meshData = generateTerrainMesh(heights, chunkSize, chunkSize, lod, 1);

  const vertexCount = meshData.interleaved.length / MESH_STRIDE;
  const vertices = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    const base = i * MESH_STRIDE;
    vertices[i * 3]     = meshData.interleaved[base];
    vertices[i * 3 + 1] = meshData.interleaved[base + 1];
    vertices[i * 3 + 2] = meshData.interleaved[base + 2];
    uvs[i * 2]     = meshData.interleaved[base + 3];
    uvs[i * 2 + 1] = meshData.interleaved[base + 4];
  }

  return {
    splat,
    vertices,
    uvs,
    normals: meshData.normals,
    indices: meshData.triangles,
    heights,
  };
}
