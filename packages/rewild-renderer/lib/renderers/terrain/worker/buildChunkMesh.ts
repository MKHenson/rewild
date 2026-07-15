import { generateTerrainMesh, MESH_STRIDE } from '../MeshGenerator';
import { generateBiomeBlendedHeightMap } from '../Noise';
import { getMaxWorldHeight, resolveClimatePreset } from '../Biomes';
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
  texture: Uint8Array;
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
  const maxWorldHeight = getMaxWorldHeight(climate);
  const heights =
    request.heights ??
    generateBiomeBlendedHeightMap(
      chunkSize,
      chunkSize,
      seed,
      new Vector2(position.x, position.y),
      climate
    );

  // Terrain colour bands based on absolute world height normalised by the
  // tallest biome, so plains keep lowland colours and rock/snow only appears
  // on genuinely tall terrain. Placeholder until per-biome materials land.
  const textureValues = new Uint8Array(chunkSize * chunkSize * 4);
  for (let i = 0; i < chunkSize * chunkSize; i++) {
    const h = heights[i] / maxWorldHeight;
    let r: number, g: number, b: number;

    if (h < 0.15) {
      // Wet lowlands — dark green/moss
      const t = h / 0.15;
      r = Math.round(40 + t * 30);
      g = Math.round(80 + t * 30);
      b = Math.round(40 + t * 10);
    } else if (h < 0.45) {
      // Grasslands
      const t = (h - 0.15) / 0.3;
      r = Math.round(70 + t * 30);
      g = Math.round(110 + t * 20);
      b = Math.round(50 + t * 10);
    } else if (h < 0.70) {
      // Upland / shrub — earthy greens transitioning to brown
      const t = (h - 0.45) / 0.25;
      r = Math.round(100 + t * 50);
      g = Math.round(130 - t * 30);
      b = Math.round(60 - t * 20);
    } else if (h < 0.88) {
      // Rocky slopes
      const t = (h - 0.70) / 0.18;
      r = Math.round(150 + t * 40);
      g = Math.round(100 + t * 30);
      b = Math.round(40 + t * 30);
    } else {
      // Mountain peaks — grey / snow
      const t = Math.min((h - 0.88) / 0.12, 1);
      r = Math.round(190 + t * 65);
      g = Math.round(130 + t * 110);
      b = Math.round(70 + t * 180);
    }

    textureValues[i * 4]     = r;
    textureValues[i * 4 + 1] = g;
    textureValues[i * 4 + 2] = b;
    textureValues[i * 4 + 3] = 255;
  }

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
    texture: textureValues,
    vertices,
    uvs,
    normals: meshData.normals,
    indices: meshData.triangles,
    heights,
  };
}
