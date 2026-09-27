import { generateTerrainMesh, MESH_STRIDE } from '../terrain/MeshGenerator';
import { buildWaterGrid, waterGridBands, waterGridQuads } from './WaterGrid';

describe('waterGridQuads', () => {
  it.each([
    [0, 240],
    [1, 120],
    [2, 60],
    [3, 30],
    [4, 30],
    [5, 15],
    [8, 15],
  ])('terrain LOD %p draws %p quads', (lod, quads) => {
    expect(waterGridQuads(lod)).toBe(quads);
  });
});

describe('waterGridBands', () => {
  it('gives the spacing each LOD transition brings in, finest first', () => {
    const distances = new Float32Array(8);
    const spacings = new Float32Array(8);
    const finest = waterGridBands(
      [
        { lod: 0, visibleDstThreshold: 200 },
        { lod: 1, visibleDstThreshold: 400 },
        { lod: 2, visibleDstThreshold: 600 },
        { lod: 3, visibleDstThreshold: 800 },
      ],
      480,
      distances,
      spacings
    );
    expect(finest).toBe(2);
    expect(Array.from(distances)).toEqual([200, 400, 600, 0, 0, 0, 0, 0]);
    expect(Array.from(spacings)).toEqual([4, 8, 16, 0, 0, 0, 0, 0]);
  });
});

describe('buildWaterGrid', () => {
  it('lays out vertices, uvs and winding exactly as the terrain mesh does', () => {
    // A 61-sample chunk at 8 m per sample has the same span as a real chunk
    // and one vertex per water map texel.
    const samples = 61;
    const flat = new Float32Array(samples * samples);
    const terrain = generateTerrainMesh(flat, samples, samples, 0, 1, 8);
    const grid = buildWaterGrid(60, 480);

    const vertexCount = samples * samples;
    for (let i = 0; i < vertexCount; i++) {
      const base = i * MESH_STRIDE;
      expect(grid.vertices[i * 3]).toBeCloseTo(terrain.interleaved[base], 5);
      expect(grid.vertices[i * 3 + 1]).toBe(0);
      expect(grid.vertices[i * 3 + 2]).toBeCloseTo(
        terrain.interleaved[base + 2],
        5
      );
      expect(grid.uvs[i * 2]).toBeCloseTo(terrain.interleaved[base + 3], 6);
      expect(grid.uvs[i * 2 + 1]).toBeCloseTo(terrain.interleaved[base + 4], 6);
    }
    expect(Array.from(grid.indices)).toEqual(
      Array.from(terrain.triangles.subarray(0, grid.indices.length))
    );
  });

  it('covers the whole span at every resolution', () => {
    for (const quads of [60, 30, 15]) {
      const grid = buildWaterGrid(quads, 480);
      const vpl = quads + 1;
      expect(grid.vertices.length).toBe(vpl * vpl * 3);
      expect(grid.indices.length).toBe(quads * quads * 6);
      expect(grid.vertices[0]).toBe(-240);
      expect(grid.vertices[2]).toBe(240);
      const last = (vpl * vpl - 1) * 3;
      expect(grid.vertices[last]).toBe(240);
      expect(grid.vertices[last + 2]).toBe(-240);
    }
  });
});
