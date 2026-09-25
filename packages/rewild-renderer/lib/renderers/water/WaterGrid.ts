import { Geometry } from '../../geometry/Geometry';

// Flat grids the water pass draws for every wet chunk. Laid out like the
// terrain mesh (MeshGenerator.generateTerrainMesh): centred on the chunk, +u is
// +x, +v is −z, and uv runs 0..1 across the chunk. Heights come from the water
// map in the vertex shader, so a grid never changes and every chunk at the same
// resolution shares one.

// Quads per side. 60 puts a vertex on every water map texel.
export const WATER_GRID_RESOLUTIONS = [60, 30, 15];

/** Quads per side for a chunk drawn at terrain LOD `lod`. */
export function waterGridQuads(lod: number): number {
  const terrainQuads = 240 / (lod === 0 ? 1 : lod * 2);
  for (const quads of WATER_GRID_RESOLUTIONS)
    if (quads <= terrainQuads) return quads;
  return WATER_GRID_RESOLUTIONS[WATER_GRID_RESOLUTIONS.length - 1];
}

/** Vertices, uvs and indices for a `quads`² grid spanning `span` metres. */
export function buildWaterGrid(
  quads: number,
  span: number
): { vertices: Float32Array; uvs: Float32Array; indices: Uint32Array } {
  const vpl = quads + 1;
  const vertices = new Float32Array(vpl * vpl * 3);
  const uvs = new Float32Array(vpl * vpl * 2);
  const indices = new Uint32Array(quads * quads * 6);
  const half = span / 2;

  let vi = 0;
  let ii = 0;
  for (let gy = 0; gy < vpl; gy++) {
    for (let gx = 0; gx < vpl; gx++) {
      const u = gx / quads;
      const v = gy / quads;
      vertices[vi * 3] = -half + u * span;
      vertices[vi * 3 + 1] = 0;
      vertices[vi * 3 + 2] = half - v * span;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;

      if (gx < quads && gy < quads) {
        indices[ii++] = vi;
        indices[ii++] = vi + vpl + 1;
        indices[ii++] = vi + vpl;
        indices[ii++] = vi + vpl + 1;
        indices[ii++] = vi;
        indices[ii++] = vi + 1;
      }
      vi++;
    }
  }
  return { vertices, uvs, indices };
}

// Keyed by device: buffers do not survive a renderer being rebuilt.
const grids = new WeakMap<GPUDevice, Map<number, Geometry>>();

/** The shared grid for `quads`, built on first use for this device. */
export function getWaterGrid(
  device: GPUDevice,
  quads: number,
  span: number
): Geometry {
  let byQuads = grids.get(device);
  if (!byQuads) {
    byQuads = new Map();
    grids.set(device, byQuads);
  }

  let geometry = byQuads.get(quads);
  if (!geometry) {
    const grid = buildWaterGrid(quads, span);
    geometry = new Geometry();
    geometry.vertices = grid.vertices;
    geometry.uvs = grid.uvs;
    geometry.indices = grid.indices;
    geometry.autoComputeBVH = false;
    byQuads.set(quads, geometry);
  }
  return geometry;
}
