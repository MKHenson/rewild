import {
  applyPaintStamp,
  createPaintMask,
  deserializePaintMask,
  isPaintMaskEmpty,
  PaintMask,
  PaintMaskSource,
  PaintStamp,
  paintMaskSize,
  samplePaintMask,
  serializePaintMask,
} from './PaintMask';

// A tiny world: chunkSize 9, step 2 → a 5-texel mask whose span is 4 texels,
// half 2. Chunk (cx, cy) texel (mx, my) sits at mask-world
// (cx*4 + mx - 2, cy*4 + 2 - my); adjacent chunks share their edge texels,
// exactly like the real 241-sample / 61-texel chunks.
const CHUNK_SIZE = 9;
const STEP = 2;
const SIZE = 5;
const SPAN = SIZE - 1;
const HALF = SPAN / 2;
const CHANNELS = 3;
// World units per mask texel, so the tests can drive the brush in world space.
const METERS_PER_SAMPLE = 2;
const UNIT = METERS_PER_SAMPLE * STEP;

class FakeSource implements PaintMaskSource {
  chunkSize = CHUNK_SIZE;
  metersPerSample = METERS_PER_SAMPLE;
  step = STEP;
  channels = CHANNELS;
  masks = new Map<string, PaintMask>();
  missing = new Set<string>();

  constructor(coords: Array<[number, number]>) {
    for (const [cx, cy] of coords) {
      this.masks.set(
        `${cx},${cy}`,
        createPaintMask(CHUNK_SIZE, CHANNELS, STEP)
      );
    }
  }

  getMask(cx: number, cy: number): PaintMask | null {
    const key = `${cx},${cy}`;
    if (this.missing.has(key)) return null;
    return this.masks.get(key) ?? null;
  }

  // Weight at a mask-world texel, read from the given chunk's own copy.
  at(cx: number, cy: number, wx: number, wz: number, channel: number): number {
    const mx = wx - cx * SPAN + HALF;
    const my = cy * SPAN + HALF - wz;
    return this.masks.get(`${cx},${cy}`)!.weights[
      channel * SIZE * SIZE + my * SIZE + mx
    ];
  }
}

// Brush centred on mask-world texel (wx, wz), radius in texels.
const stamp = (overrides: Partial<PaintStamp> = {}): PaintStamp => ({
  type: 'paint',
  channel: 0,
  centerX: 0,
  centerZ: 0,
  radius: 2 * UNIT,
  amount: 1,
  ...overrides,
});

describe('paintMaskSize', () => {
  it('places texels on the chunk edges so neighbours share them', () => {
    expect(paintMaskSize(241, 4)).toBe(61);
    expect(paintMaskSize(9, 2)).toBe(5);
    expect(paintMaskSize(241, 1)).toBe(241);
  });

  it('rejects a step that does not divide the chunk span', () => {
    expect(() => paintMaskSize(241, 7)).toThrow(/divide the chunk span/);
  });
});

describe('samplePaintMask', () => {
  it('bilinearly interpolates between texels', () => {
    const mask = createPaintMask(CHUNK_SIZE, CHANNELS, STEP);
    // Texel (0,0) full, texel (1,0) empty — samples 0 and 2 respectively.
    mask.weights[0] = 255;
    const out = new Float64Array(CHANNELS);

    expect(samplePaintMask(mask, 0, 0, out)).toBeCloseTo(1);
    expect(out[0]).toBeCloseTo(1);
    // Halfway between the two texels (sample 1 of 0..2).
    expect(samplePaintMask(mask, 1, 0, out)).toBeCloseTo(0.5);
    expect(samplePaintMask(mask, 2, 0, out)).toBeCloseTo(0);
  });

  it('reports the total across channels and leaves untouched channels at 0', () => {
    const mask = createPaintMask(CHUNK_SIZE, CHANNELS, STEP);
    const plane = SIZE * SIZE;
    mask.weights[0] = 128; // channel 0
    mask.weights[plane] = 64; // channel 1
    const out = new Float64Array(CHANNELS);

    const total = samplePaintMask(mask, 0, 0, out);
    expect(out[0]).toBeCloseTo(128 / 255);
    expect(out[1]).toBeCloseTo(64 / 255);
    expect(out[2]).toBe(0);
    expect(total).toBeCloseTo(192 / 255);
  });

  it('renormalises rather than clipping when channels out-sum 1', () => {
    const mask = createPaintMask(CHUNK_SIZE, CHANNELS, STEP);
    const plane = SIZE * SIZE;
    mask.weights[0] = 255;
    mask.weights[plane] = 255;
    const out = new Float64Array(CHANNELS);

    expect(samplePaintMask(mask, 0, 0, out)).toBe(1);
    expect(out[0] + out[1] + out[2]).toBeCloseTo(1);
  });

  it('clamps at the mask edge instead of reading out of bounds', () => {
    const mask = createPaintMask(CHUNK_SIZE, CHANNELS, STEP);
    mask.weights[SIZE * SIZE - 1] = 255; // last texel of channel 0
    const out = new Float64Array(CHANNELS);

    // Sample 8 is the last LOD-0 sample, exactly on the last texel.
    expect(samplePaintMask(mask, CHUNK_SIZE - 1, CHUNK_SIZE - 1, out)).toBeCloseTo(1);
  });
});

describe('paint mask serialization', () => {
  it('round-trips a painted mask', () => {
    const mask = createPaintMask(CHUNK_SIZE, CHANNELS, STEP);
    mask.weights[0] = 200;
    mask.weights[SIZE * SIZE + 3] = 17;

    const restored = deserializePaintMask(serializePaintMask(mask));
    expect(restored.size).toBe(mask.size);
    expect(restored.step).toBe(STEP);
    expect(restored.channels).toBe(CHANNELS);
    expect(Array.from(restored.weights)).toEqual(Array.from(mask.weights));
  });

  it('rejects a truncated blob rather than misreading it', () => {
    const buffer = serializePaintMask(createPaintMask(CHUNK_SIZE, CHANNELS, STEP));
    expect(() => deserializePaintMask(buffer.slice(0, 30))).toThrow(
      /body is .* expected/
    );
  });

  it('rejects an unknown version', () => {
    const buffer = serializePaintMask(createPaintMask(CHUNK_SIZE, CHANNELS, STEP));
    new DataView(buffer).setUint32(0, 99, true);
    expect(() => deserializePaintMask(buffer)).toThrow(/version 99/);
  });
});

describe('applyPaintStamp', () => {
  it('paints with smoothstep falloff — full at centre, zero at the radius', () => {
    const source = new FakeSource([[0, 0]]);
    const touched = applyPaintStamp(source, stamp());

    expect(touched.map((t) => `${t.cx},${t.cy}`)).toEqual(['0,0']);
    expect(source.at(0, 0, 0, 0, 0)).toBe(255); // centre: falloff 1
    expect(source.at(0, 0, 1, 0, 0)).toBe(128); // half radius: smoothstep 0.5
    expect(source.at(0, 0, 2, 0, 0)).toBe(0); // at the radius: falloff 0
  });

  it('eases toward saturation over repeated stamps without stalling', () => {
    const source = new FakeSource([[0, 0]]);
    for (let i = 0; i < 200; i++) {
      applyPaintStamp(source, stamp({ amount: 0.02 }));
    }
    expect(source.at(0, 0, 0, 0, 0)).toBe(255);
  });

  it('squeezes previously painted channels into the remaining budget', () => {
    const source = new FakeSource([[0, 0]]);
    applyPaintStamp(source, stamp({ channel: 0, amount: 1 }));
    expect(source.at(0, 0, 0, 0, 0)).toBe(255);

    // Painting a second biome over the first must displace it, not stack on it.
    applyPaintStamp(source, stamp({ channel: 1, amount: 1 }));
    expect(source.at(0, 0, 0, 0, 1)).toBe(255);
    expect(source.at(0, 0, 0, 0, 0)).toBe(0);
  });

  it('keeps the stored channels summing to at most 255', () => {
    const source = new FakeSource([[0, 0]]);
    for (const channel of [0, 1, 2, 0, 2]) {
      applyPaintStamp(source, stamp({ channel, amount: 0.4 }));
    }
    for (let wz = -2; wz <= 2; wz++) {
      for (let wx = -2; wx <= 2; wx++) {
        const total =
          source.at(0, 0, wx, wz, 0) +
          source.at(0, 0, wx, wz, 1) +
          source.at(0, 0, wx, wz, 2);
        expect(total).toBeLessThanOrEqual(255);
      }
    }
  });

  it('erase lifts every channel back toward the generator', () => {
    const source = new FakeSource([[0, 0]]);
    applyPaintStamp(source, stamp({ channel: 0, amount: 1 }));
    applyPaintStamp(source, stamp({ channel: 1, amount: 0.5 }));

    for (let i = 0; i < 200; i++) {
      applyPaintStamp(source, stamp({ type: 'erase', amount: 0.05 }));
    }
    expect(source.at(0, 0, 0, 0, 0)).toBe(0);
    expect(source.at(0, 0, 0, 0, 1)).toBe(0);
  });

  it('writes shared edge texels identically in every owning chunk', () => {
    // Four chunks meeting at mask-world (2, 2) — that texel is owned by all
    // four, and the edge texels along x=2 / z=2 by two each.
    const source = new FakeSource([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    // Centre the brush on the shared corner so the disc straddles all four.
    applyPaintStamp(
      source,
      stamp({ centerX: 2 * UNIT, centerZ: 2 * UNIT, radius: 2 * UNIT })
    );

    const coords: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    let sharedChecked = 0;

    for (let wz = 0; wz <= 4; wz++) {
      for (let wx = 0; wx <= 4; wx++) {
        // Every chunk that owns (wx, wz) must hold the same byte.
        const owners = coords.filter(([cx, cy]) => {
          const mx = wx - cx * SPAN + HALF;
          const my = cy * SPAN + HALF - wz;
          return mx >= 0 && mx < SIZE && my >= 0 && my < SIZE;
        });
        if (owners.length < 2) continue;
        sharedChecked++;
        const values = owners.map(([cx, cy]) => source.at(cx, cy, wx, wz, 0));
        expect(new Set(values).size).toBe(1);
      }
    }

    // Guard the guard: if the ownership math above ever stopped finding shared
    // texels this test would pass vacuously.
    expect(sharedChecked).toBeGreaterThan(0);
    // And the corner every chunk owns actually got painted.
    expect(source.at(0, 0, 2, 2, 0)).toBe(255);
  });

  it('skips a texel whose other owner is unavailable, leaving no half-written edge', () => {
    const source = new FakeSource([
      [0, 0],
      [1, 0],
    ]);
    source.missing.add('1,0');

    // Brush centred on the shared edge column (mask-world x = 2).
    applyPaintStamp(source, stamp({ centerX: 2 * UNIT, radius: 2 * UNIT }));

    // The shared column must be untouched in the chunk that IS available.
    expect(source.at(0, 0, 2, 0, 0)).toBe(0);
    // Interior texels of the available chunk still painted.
    expect(source.at(0, 0, 1, 0, 0)).toBeGreaterThan(0);
  });

  it('reports no touched chunks when nothing changed', () => {
    const source = new FakeSource([[0, 0]]);
    expect(applyPaintStamp(source, stamp({ amount: 0 }))).toEqual([]);
    expect(applyPaintStamp(source, stamp({ radius: 0 }))).toEqual([]);
    // Erasing an unpainted mask is a no-op.
    expect(applyPaintStamp(source, stamp({ type: 'erase' }))).toEqual([]);
  });

  it('ignores a stamp on a channel the mask does not have', () => {
    const source = new FakeSource([[0, 0]]);
    expect(applyPaintStamp(source, stamp({ channel: CHANNELS }))).toEqual([]);
    expect(isPaintMaskEmpty(source.masks.get('0,0')!)).toBe(true);
  });
});
