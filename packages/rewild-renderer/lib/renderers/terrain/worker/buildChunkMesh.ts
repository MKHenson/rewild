import {
  generateTerrainMesh,
  MESH_STRIDE,
  TERRAIN_METERS_PER_SAMPLE,
} from '../MeshGenerator';
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
  // LOD-0 heights from a saved chunk snapshot. Present ⇒ these drive the mesh
  // geometry/splat instead of the generator; absent ⇒ generate from the recipe.
  heights?: Float32Array;
  // Pre-assembled (chunkSize+2)² apron for an edited chunk: its own heights in
  // the centre and the real neighbour ring around them (TerrainRenderer.
  // buildApron). When present it drives geometry, splat and seamless two-sided
  // edge normals, and `heights` is omitted (the apron carries them).
  apron?: Float32Array;
  // The heights diverge from the deterministic generator (an edit / snapshot).
  // With no `apron` to shade against, such a chunk cannot use the noise apron
  // ring for its edge normals — the ring no longer matches its surface — so it
  // shades edges one-sided instead. Only meaningful with `heights`/`apron`.
  edited?: boolean;
}

// One-sample apron ring so edge-vertex normals get a two-sided gradient that
// matches the neighbour chunk — otherwise coarse distant chunks show a lighting
// seam at their borders. The ring holds the neighbour baseline heights; the
// chunk's own samples sit in the centre.
const APRON = 1;

// Copies the inner chunkSize² region out of an aproned (chunkSize+2·APRON)²
// field — the geometry/physics/splat heights, and what the main thread caches.
function extractInner(
  apron: Float32Array,
  apronSize: number,
  size: number
): Float32Array {
  const inner = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const src = (y + APRON) * apronSize + APRON;
    inner.set(apron.subarray(src, src + size), y * size);
  }
  return inner;
}

// Writes an edited chunkSize² heightfield into the centre of an aproned field,
// leaving the (noise) ring as the neighbour baseline for normals.
function overlayInner(
  apron: Float32Array,
  apronSize: number,
  inner: Float32Array,
  size: number
): void {
  for (let y = 0; y < size; y++) {
    apron.set(inner.subarray(y * size, y * size + size), (y + APRON) * apronSize + APRON);
  }
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

  // Heightfield + normal source. Two cases:
  //
  // Unedited (generated or cached-generated): generate with a 1-sample apron
  // ring (chunkSize+2 square). Generating at this size with the same offset
  // leaves the inner chunkSize² byte-identical to a bare generation, and the
  // ring — the neighbour baseline — gives edge vertices a two-sided gradient
  // that matches the neighbour: seamless.
  //
  // Edited (a sculpt or a loaded snapshot): the provided heights no longer match
  // the noise ring, so an apron would shade edges against the wrong neighbour
  // (dark seams). Skip generation entirely and shade one-sided (apronMargin 0)
  // from the provided heights — the same edge quality edited terrain had before
  // seamless normals, without the artifact. (A future upgrade could feed real
  // neighbour heights from the main thread for fully seamless edited borders.)
  const apronSize = chunkSize + 2 * APRON;
  let heights: Float32Array;
  let meshHeights: Float32Array;
  let meshApron: number;
  if (request.apron) {
    // Edited, seamless: the main thread supplied the neighbour apron. Its inner
    // region is the chunk's heights (geometry/splat/return); its ring gives edge
    // vertices a two-sided gradient matching the neighbour.
    heights = extractInner(request.apron, apronSize, chunkSize);
    meshHeights = request.apron;
    meshApron = APRON;
  } else if (request.edited && request.heights) {
    // Edited but no apron available (e.g. neighbours not loaded on a first
    // snapshot build): shade one-sided rather than against the mismatched noise
    // ring — a small edge crease instead of a dark seam.
    heights = request.heights;
    meshHeights = heights;
    meshApron = 0;
  } else {
    const apronHeights = generateBiomeBlendedHeightMap(
      apronSize,
      apronSize,
      seed,
      worldOffset,
      climate
    );
    if (request.heights) {
      // Cached-generated heights: identical to the apron's inner region, so the
      // overlay is a no-op that keeps the two paths byte-for-byte equal.
      heights = request.heights;
      overlayInner(apronHeights, apronSize, heights, chunkSize);
    } else {
      heights = extractInner(apronHeights, apronSize, chunkSize);
    }
    meshHeights = apronHeights;
    meshApron = APRON;
  }

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

  // Heights are already in meters (no vertical scaling); the mesh is stretched
  // horizontally by TERRAIN_METERS_PER_SAMPLE. The noise offset (position) is
  // left in sample space above, so the heightfield itself is unchanged and
  // chunks stay seam-free at any scale. meshHeights/meshApron carry the apron
  // (two-sided seamless normals) for unedited chunks, or the bare heights
  // (one-sided edges) for edited ones.
  const meshData = generateTerrainMesh(
    meshHeights,
    chunkSize,
    chunkSize,
    lod,
    1,
    TERRAIN_METERS_PER_SAMPLE,
    meshApron
  );

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
