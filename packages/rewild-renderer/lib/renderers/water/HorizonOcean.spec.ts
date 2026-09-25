import { packHorizonParams } from '../../materials/uniforms/HorizonUniforms';
import { buildHorizonRing } from './HorizonOcean';

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
      maxViewDst: 2800,
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
      scatter: [0.5, 0.25, 0.125],
    });
    expect(packed.byteLength).toBe(80);
    expect(Array.from(packed)).toEqual([
      1, 2, 2800, 480, 5, 6, 16000, 7, 8, 9, 131072, 0.25, 0.5, 0.125, 0, 0,
      0.5, 0.25, 0.125, 1,
    ]);
  });
});
