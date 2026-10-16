import { packHorizonParams } from '../../materials/uniforms/HorizonUniforms';
import {
  CHUNK_MASK_SIZE,
  INFINITE_EDGE,
  buildHorizonRing,
  chunkMaskIndex,
  oceanSlopeVariance,
} from './HorizonOcean';

describe('buildHorizonRing', () => {
  const segments = 16;
  const bands = 4;
  const spokes = segments + 1;
  const ring = buildHorizonRing(segments, bands, 0);

  it('lays out the finite rings from 0 to 1, then one at infinity', () => {
    expect(ring.vertices.length).toBe(spokes * (bands + 2) * 3);
    for (let k = 0; k <= bands + 1; k++) {
      for (let i = 0; i < spokes; i++) {
        const v = (k * spokes + i) * 3;
        expect(Math.hypot(ring.vertices[v], ring.vertices[v + 1])).toBeCloseTo(
          1,
          6
        );
        expect(ring.vertices[v]).toBeCloseTo(ring.vertices[i * 3], 6);
        expect(ring.vertices[v + 2]).toBe(k <= bands ? k / bands : INFINITE_EDGE);
      }
    }
  });

  it('closes each ring on its first spoke', () => {
    const last = segments * 3;
    expect(ring.vertices[last]).toBeCloseTo(ring.vertices[0], 6);
    expect(ring.vertices[last + 1]).toBeCloseTo(ring.vertices[1], 6);
  });

  it('spans each cell with two triangles, inner rings first', () => {
    expect(ring.indices.length).toBe(segments * (bands + 1) * 6);
    for (let k = 0; k <= bands; k++) {
      for (let i = 0; i < segments; i++) {
        const t = (k * segments + i) * 6;
        const inner = k * spokes + i;
        expect(new Set(ring.indices.subarray(t, t + 6))).toEqual(
          new Set([inner, inner + 1, inner + spokes, inner + spokes + 1])
        );
      }
    }
  });

  it('runs the inner bands evenly from the centre to the first finite ring', () => {
    const innerBands = 3;
    const closed = buildHorizonRing(segments, bands, innerBands);
    const rings = innerBands + bands + 2;
    expect(closed.vertices.length).toBe(spokes * rings * 3);
    expect(closed.indices.length).toBe(segments * (rings - 1) * 6);
    const radial = (k: number) => closed.vertices[k * spokes * 3 + 2];
    expect(radial(0)).toBe(-1);
    expect(radial(1)).toBeCloseTo(-2 / 3, 6);
    expect(radial(innerBands)).toBe(0);
    expect(radial(innerBands + bands)).toBe(1);
    expect(radial(rings - 1)).toBe(INFINITE_EDGE);
  });
});

describe('packHorizonParams', () => {
  it('lays out the HorizonParams struct', () => {
    const packed = packHorizonParams({
      centreX: 1,
      centreZ: 2,
      innerRadius: 1360,
      chunkSize: 480,
      nearCentreX: 5,
      nearCentreZ: 6,
      nearSpan: 16000,
      wideCentreX: 8,
      wideCentreZ: 9,
      wideSpan: 131072,
      seaLevel: 7,
      roughness: 0.25,
      coast: 0.5,
      blendHalfWidth: 0.125,
      maskOriginX: 3,
      maskOriginZ: -4,
      scatter: [0.5, 0.25, 0.125],
      slopeVariance: 0.03125,
      outerRadius: 24000,
      fadeStart: 16000,
      fogged: true,
      paletteLayers: [3, 1, 4, 1, 5, 9, 2, 6],
      detailLayer: 5,
      detailYSign: -1,
      detailTile: 160,
      detailStrength: 0.75,
    });
    expect(packed.byteLength).toBe(144);
    expect(Array.from(packed)).toEqual([
      1, 2, 1360, 480, 5, 6, 16000, 7, 8, 9, 131072, 0.25, 0.5, 0.125, 3, -4,
      0.5, 0.25, 0.125, 0.03125, 24000, 16000, 1, 0, 3, 1, 4, 1, 5, 9, 2, 6,
      5, -1, 160, 0.75,
    ]);
  });
});

describe('chunkMaskIndex', () => {
  it('centres the mask on the origin chunk, rows along z', () => {
    const half = CHUNK_MASK_SIZE / 2;
    expect(chunkMaskIndex(10, -3, 10, -3)).toBe(half * CHUNK_MASK_SIZE + half);
    expect(chunkMaskIndex(11, -3, 10, -3)).toBe(
      half * CHUNK_MASK_SIZE + half + 1
    );
    expect(chunkMaskIndex(10, -2, 10, -3)).toBe(
      (half + 1) * CHUNK_MASK_SIZE + half
    );
  });

  it('covers every chunk the terrain can draw', () => {
    // 2800 m view distance over 480 m chunks: six either side of the centre.
    expect(chunkMaskIndex(-6, -6, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(chunkMaskIndex(6, 6, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(chunkMaskIndex(-9, 0, 0, 0)).toBe(-1);
    expect(chunkMaskIndex(0, 8, 0, 0)).toBe(-1);
  });
});

describe('oceanSlopeVariance', () => {
  it('follows Cox and Munk', () => {
    expect(oceanSlopeVariance(0)).toBeCloseTo(0.003);
    expect(oceanSlopeVariance(10)).toBeCloseTo(0.0542);
  });
});
