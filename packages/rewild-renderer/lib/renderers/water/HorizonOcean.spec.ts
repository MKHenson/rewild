import { packHorizonParams } from '../../materials/uniforms/HorizonUniforms';
import {
  CHUNK_MASK_SIZE,
  buildHorizonRing,
  chunkMaskIndex,
  oceanSlopeVariance,
} from './HorizonOcean';

describe('buildHorizonRing', () => {
  const segments = 16;
  const ring = buildHorizonRing(segments);

  it('pairs an inner and an outer vertex per spoke, closing the loop', () => {
    expect(ring.vertices.length).toBe((segments + 1) * 2 * 3);
    for (let i = 0; i <= segments; i++) {
      const inner = ring.vertices.subarray(i * 6, i * 6 + 3);
      const outer = ring.vertices.subarray(i * 6 + 3, i * 6 + 6);
      expect(Math.hypot(inner[0], inner[1])).toBeCloseTo(1, 6);
      expect(inner[2]).toBe(0);
      expect(outer[0]).toBe(inner[0]);
      expect(outer[1]).toBe(inner[1]);
      expect(outer[2]).toBe(1);
    }
    expect(ring.vertices[segments * 6]).toBeCloseTo(ring.vertices[0], 6);
    expect(ring.vertices[segments * 6 + 1]).toBeCloseTo(ring.vertices[1], 6);
  });

  it('spans every segment with two triangles over its four vertices', () => {
    expect(ring.indices.length).toBe(segments * 6);
    for (let i = 0; i < segments; i++) {
      const quad = Array.from(ring.indices.subarray(i * 6, i * 6 + 6));
      expect(new Set(quad)).toEqual(
        new Set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 3])
      );
    }
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
    });
    expect(packed.byteLength).toBe(80);
    expect(Array.from(packed)).toEqual([
      1, 2, 1360, 480, 5, 6, 16000, 7, 8, 9, 131072, 0.25, 0.5, 0.125, 3, -4,
      0.5, 0.25, 0.125, 0.03125,
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
