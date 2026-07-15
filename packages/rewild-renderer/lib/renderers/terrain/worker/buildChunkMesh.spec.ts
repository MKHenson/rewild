import { Vector2 } from 'rewild-common';
import { buildChunkMesh } from './buildChunkMesh';
import { generateBiomeBlendedHeightMap } from '../Noise';
import { DEFAULT_CLIMATE_PRESET, resolveClimatePreset } from '../Biomes';

// Small chunk keeps the test fast; width-1 (24) is divisible by every LOD
// increment (lod*2), mirroring the 241-sample production layout.
const CHUNK_SIZE = 25;
const SEED = 9876;
const POSITION = { x: 3 * (CHUNK_SIZE - 1), y: -2 * (CHUNK_SIZE - 1) };

const baseRequest = {
  chunkSize: CHUNK_SIZE,
  position: POSITION,
  seed: SEED,
  climatePreset: DEFAULT_CLIMATE_PRESET,
};

describe('buildChunkMesh', () => {
  it('produces identical meshes whether heights are generated or provided (all LODs)', () => {
    // The exact heights the generate path will produce internally.
    const heights = generateBiomeBlendedHeightMap(
      CHUNK_SIZE,
      CHUNK_SIZE,
      SEED,
      new Vector2(POSITION.x, POSITION.y),
      resolveClimatePreset(DEFAULT_CLIMATE_PRESET)
    );

    for (const lod of [0, 1, 2, 3]) {
      const generated = buildChunkMesh({ ...baseRequest, lod });
      const provided = buildChunkMesh({ ...baseRequest, lod, heights });

      expect(provided.vertices).toEqual(generated.vertices);
      expect(provided.uvs).toEqual(generated.uvs);
      expect(provided.normals).toEqual(generated.normals);
      expect(provided.indices).toEqual(generated.indices);
      expect(provided.texture).toEqual(generated.texture);
      expect(provided.heights).toEqual(generated.heights);
    }
  });

  it('returns the LOD-0 heightfield the mesh was built from', () => {
    const generated = buildChunkMesh({ ...baseRequest, lod: 2 });
    expect(generated.heights).toEqual(
      generateBiomeBlendedHeightMap(
        CHUNK_SIZE,
        CHUNK_SIZE,
        SEED,
        new Vector2(POSITION.x, POSITION.y),
        resolveClimatePreset(DEFAULT_CLIMATE_PRESET)
      )
    );

    const supplied = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(7);
    const provided = buildChunkMesh({ ...baseRequest, lod: 2, heights: supplied });
    expect(provided.heights).toEqual(supplied);
  });

  it('meshes provided heights without consulting the generator', () => {
    // Snapshot heights that generation could never produce for this seed —
    // a constant field. The mesh must reflect them exactly. Only the main
    // vertices are surface samples; the skirt vertices appended after them
    // are deliberately lowered below the surface.
    const flat = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(42);
    const result = buildChunkMesh({ ...baseRequest, lod: 0, heights: flat });

    const mainVertCount = CHUNK_SIZE * CHUNK_SIZE; // vpl² at LOD 0
    for (let i = 0; i < mainVertCount; i++) {
      expect(result.vertices[i * 3 + 1]).toBe(42);
    }
  });

  it('downsamples provided heights per LOD like generated ones', () => {
    const heights = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let i = 0; i < heights.length; i++) heights[i] = i * 0.01;

    const lod0 = buildChunkMesh({ ...baseRequest, lod: 0, heights });
    const lod2 = buildChunkMesh({ ...baseRequest, lod: 2, heights });

    // Fewer vertices at coarser LODs, but both sampled from the same field.
    expect(lod2.vertices.length).toBeLessThan(lod0.vertices.length);
    // Corner sample (first vertex) is shared by every LOD.
    expect(lod2.vertices[1]).toBe(lod0.vertices[1]);
  });
});
