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
      expect(provided.splat).toEqual(generated.splat);
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

  it('drives geometry from provided heights (generation only supplies the normal apron)', () => {
    // Snapshot heights that generation could never produce for this seed —
    // a constant field. The mesh geometry must reflect them exactly (the
    // generator is still consulted, but only for the apron ring that feeds edge
    // normals — it must not leak into the surface samples). Only the main
    // vertices are surface samples; the skirt vertices appended after them
    // are deliberately lowered below the surface.
    const flat = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(42);
    const result = buildChunkMesh({ ...baseRequest, lod: 0, heights: flat });

    const mainVertCount = CHUNK_SIZE * CHUNK_SIZE; // vpl² at LOD 0
    for (let i = 0; i < mainVertCount; i++) {
      expect(result.vertices[i * 3 + 1]).toBe(42);
    }
  });

  it('edge-vertex normals match across a chunk border (no lighting seam)', () => {
    // Two horizontally-adjacent chunks (offsets 0 and CHUNK_SIZE-1) share a
    // column of samples. The apron ring lets each compute that column's normals
    // from the same neighbour heights, so their shared edge vertices carry
    // identical normals — the seam this apron exists to remove. Checked at a
    // coarse LOD too, where the pre-apron facet normals diverged most.
    for (const lod of [0, 2]) {
      const left = buildChunkMesh({ ...baseRequest, lod, position: { x: 0, y: 0 } });
      const right = buildChunkMesh({
        ...baseRequest,
        lod,
        position: { x: CHUNK_SIZE - 1, y: 0 },
      });

      const inc = lod === 0 ? 1 : lod * 2;
      const vpl = (CHUNK_SIZE - 1) / inc + 1;

      let sawTilt = false;
      for (let gy = 0; gy < vpl; gy++) {
        const leftRight = (gy * vpl + (vpl - 1)) * 3; // left chunk's right edge
        const rightLeft = (gy * vpl + 0) * 3; //          right chunk's left edge
        for (let k = 0; k < 3; k++) {
          expect(right.normals[rightLeft + k]).toBeCloseTo(
            left.normals[leftRight + k],
            5
          );
        }
        // Guard against a vacuous pass on flat (0,1,0) normals.
        if (Math.abs(left.normals[leftRight]) > 1e-3) sawTilt = true;
      }
      expect(sawTilt).toBe(true);
    }
  });

  it('shades edited heights one-sided, not against the noise apron', () => {
    // A flat edited chunk has zero gradient, so every normal — edges included —
    // must be straight up. If the edited path shaded edge vertices against the
    // noise apron ring (which is not flat), the border vertices would tilt: the
    // dark-seam bug on sculpted chunk borders. `edited: true` forces one-sided
    // edges from the provided heights instead.
    const flat = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(12);
    const result = buildChunkMesh({
      ...baseRequest,
      lod: 0,
      heights: flat,
      edited: true,
    });

    const mainVertCount = CHUNK_SIZE * CHUNK_SIZE; // vpl² at LOD 0
    for (let i = 0; i < mainVertCount; i++) {
      expect(result.normals[i * 3]).toBeCloseTo(0, 6);
      expect(result.normals[i * 3 + 1]).toBeCloseTo(1, 6);
      expect(result.normals[i * 3 + 2]).toBeCloseTo(0, 6);
    }
  });

  it('shades edited edges two-sided from a provided neighbour apron', () => {
    // A constant-gradient ramp across the whole apron (inner AND ring): every
    // normal, edges included, must be identical. A one-sided edge (no apron)
    // would use half the gradient at the border and tilt differently — the seam
    // the neighbour apron removes for sculpted chunks.
    const a = CHUNK_SIZE + 2 * 1; // APRON = 1
    const apron = new Float32Array(a * a);
    for (let y = 0; y < a; y++)
      for (let x = 0; x < a; x++) apron[y * a + x] = x; // ramp along x

    const result = buildChunkMesh({ ...baseRequest, lod: 0, apron, edited: true });

    const vpl = CHUNK_SIZE; // LOD 0
    const cornerN = (0 * vpl + 0) * 3; // an edge (corner) vertex
    const interiorN = (2 * vpl + 2) * 3; // a well-interior vertex
    for (let k = 0; k < 3; k++) {
      expect(result.normals[cornerN + k]).toBeCloseTo(
        result.normals[interiorN + k],
        6
      );
    }
    // Non-vacuous: the ramp really tilts the normal off vertical.
    expect(Math.abs(result.normals[interiorN])).toBeGreaterThan(1e-3);
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
