import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';

// The patch snaps to the terrain's sample lattice, so its edge always runs
// along base mesh vertices and the base triangles under it sink whole.
const PATCH_SNAP = TERRAIN_METERS_PER_SAMPLE;

// Metres inside the patch edge by which displacement has faded to nothing.
// Covers the camera's offset from the snapped centre (half a snap) plus one
// base cell, whose corner triangles can stay unsunk along the edge.
const PATCH_EDGE_MARGIN = PATCH_SNAP * 1.5;

// Fraction of the fade radius at which displacement starts to fade. Low, so
// the morph is spread thin: the ground ahead rises by the relief's depth over
// this whole band as the camera walks toward it.
const PATCH_FADE_START = 0.3;

/**
 * Where the displaced patch sits on one chunk, in that chunk's object space.
 *
 * `rect` is the whole patch, which the base mesh sinks under; the grid is its
 * part on this chunk, which the patch draws as `cellsZ` strips of `cellsX`
 * cells running from (`gridX`, `gridZ`) toward +x and -z.
 */
export class TerrainPatchPlacement {
  active = false;
  minX = 0;
  minZ = 0;
  maxX = 0;
  maxZ = 0;
  gridX = 0;
  gridZ = 0;
  spacing = 0;
  cellsX = 0;
  cellsZ = 0;
  eyeX = 0;
  eyeZ = 0;
  fadeStart = 0;
  fadeEnd = 0;
}

/**
 * Places a `size`-metre patch around the eye on the chunk centred at
 * (`chunkX`, `chunkZ`) with `chunkHalf` metres to each edge. Returns false,
 * leaving `out` inactive, when the patch misses the chunk.
 *
 *     placeTerrainPatch(eye.x, eye.z, 32, 0.08, chunk.x, chunk.z, 240, out);
 */
export function placeTerrainPatch(
  eyeX: number,
  eyeZ: number,
  size: number,
  spacing: number,
  chunkX: number,
  chunkZ: number,
  chunkHalf: number,
  out: TerrainPatchPlacement
): boolean {
  const half = Math.round(size / 2 / PATCH_SNAP) * PATCH_SNAP;
  const centreX = Math.round(eyeX / PATCH_SNAP) * PATCH_SNAP;
  const centreZ = Math.round(eyeZ / PATCH_SNAP) * PATCH_SNAP;

  out.minX = centreX - half - chunkX;
  out.maxX = centreX + half - chunkX;
  out.minZ = centreZ - half - chunkZ;
  out.maxZ = centreZ + half - chunkZ;

  const clipMinX = Math.max(out.minX, -chunkHalf);
  const clipMaxX = Math.min(out.maxX, chunkHalf);
  const clipMinZ = Math.max(out.minZ, -chunkHalf);
  const clipMaxZ = Math.min(out.maxZ, chunkHalf);

  out.active = clipMaxX > clipMinX && clipMaxZ > clipMinZ;
  if (!out.active) return false;

  out.gridX = clipMinX;
  out.gridZ = clipMaxZ;
  out.spacing = spacing;
  out.cellsX = Math.round((clipMaxX - clipMinX) / spacing);
  out.cellsZ = Math.round((clipMaxZ - clipMinZ) / spacing);
  out.eyeX = eyeX - chunkX;
  out.eyeZ = eyeZ - chunkZ;
  out.fadeEnd = Math.max(half - PATCH_EDGE_MARGIN, 0);
  out.fadeStart = out.fadeEnd * PATCH_FADE_START;
  return true;
}
