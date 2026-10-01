import { SculptHeightSource } from './Sculpt';
import {
  CARVE_BANK_SLOPE,
  WATER_LIP_EASE,
  WATER_LIP_WIDTH,
  applyCarveStamp,
  applyRaiseStamp,
  applyWaterLip,
  buildShoreGrid,
  buildWaterLevels,
} from './WaterCarve';
import { WATER_EDIT_STEP, buildWaterGuard, isWaterBlocked } from './WaterEdit';
import { ResolvedWater, SWASH_REACH, waterShowsAt } from './WaterMap';

// One chunk of 81 samples at 1 m per sample: span 80, texels of 4 m, 21
// texels a side. World sample (wx, wz) sits at chunk sample
// (wx + 40, 40 - wz); world texel (i, j) at (i + 10, 10 - j).
const CHUNK_SIZE = 81;
const SPAN = CHUNK_SIZE - 1;
const HALF = SPAN / 2;
const TEXEL_SPAN = SPAN / WATER_EDIT_STEP;
const TEXEL_HALF = TEXEL_SPAN / 2;
const TEXELS = TEXEL_SPAN + 1;
const UNIT = WATER_EDIT_STEP;

class FakeSource implements SculptHeightSource {
  chunkSize = CHUNK_SIZE;
  metersPerSample = 1;
  heights = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

  constructor(fill: (wx: number, wz: number) => number) {
    for (let sy = 0; sy < CHUNK_SIZE; sy++)
      for (let sx = 0; sx < CHUNK_SIZE; sx++)
        this.heights[sy * CHUNK_SIZE + sx] = fill(sx - HALF, HALF - sy);
  }

  getHeights(cx: number, cy: number) {
    return cx === 0 && cy === 0 ? this.heights : null;
  }

  at(wx: number, wz: number) {
    return this.heights[(HALF - wz) * CHUNK_SIZE + wx + HALF];
  }
}

function fakeWater(
  fill: (i: number, j: number) => [number, number, number] | null
): ResolvedWater {
  const count = TEXELS * TEXELS;
  const water: ResolvedWater = {
    size: TEXELS,
    step: WATER_EDIT_STEP,
    coverage: new Uint8Array(count),
    levels: new Float64Array(count),
    typeWeights: new Uint8Array(count * 4),
    bodyIds: new Uint32Array(count),
    lakes: [],
    covered: false,
  };
  for (let my = 0; my < TEXELS; my++)
    for (let mx = 0; mx < TEXELS; mx++) {
      const texel = fill(mx - TEXEL_HALF, TEXEL_HALF - my);
      if (!texel) continue;
      const t = my * TEXELS + mx;
      [water.coverage[t], water.levels[t], water.bodyIds[t]] = texel;
    }
  return water;
}

const only = (water: ResolvedWater) => (cx: number, cy: number) =>
  cx === 0 && cy === 0 ? water : null;

const openGuard = (bodyId = 7, level = 10) =>
  buildWaterGuard(
    only(fakeWater(() => null)),
    TEXEL_SPAN,
    -TEXEL_HALF,
    -TEXEL_HALF,
    TEXEL_HALF,
    TEXEL_HALF,
    bodyId,
    level
  );

describe('buildWaterGuard', () => {
  const water = fakeWater((i, j) => {
    if (i === 5 && j === 0) return [255, 20, 3];
    if (i === -5 && j === 0) return [255, 10.02, 4];
    if (i === 0 && j === 5) return [255, 30, 7];
    return null;
  });
  const guard = buildWaterGuard(
    only(water),
    TEXEL_SPAN,
    -TEXEL_HALF,
    -TEXEL_HALF,
    TEXEL_HALF,
    TEXEL_HALF,
    7,
    10
  );

  it('blocks water at another level and the texels around it', () => {
    expect(isWaterBlocked(guard, 5, 0)).toBe(true);
    expect(isWaterBlocked(guard, 4, 1)).toBe(true);
    expect(isWaterBlocked(guard, 3, 0)).toBe(false);
  });

  it('lets through water at the same level and the stroke’s own body', () => {
    expect(isWaterBlocked(guard, -5, 0)).toBe(false);
    expect(isWaterBlocked(guard, 0, 5)).toBe(false);
  });

  it('blocks texels whose water is not known, and outside its box', () => {
    const unknown = buildWaterGuard(() => null, TEXEL_SPAN, 0, 0, 2, 2, 7, 10);
    expect(isWaterBlocked(unknown, 1, 1)).toBe(true);
    expect(isWaterBlocked(guard, TEXEL_HALF + 1, 0)).toBe(true);
  });
});

describe('buildWaterGuard over the ground', () => {
  // Sea coverage at level 0 over the whole chunk, as inland of the coast.
  const sea = fakeWater(() => [255, 0, 0]);
  const guardOver = (heights: Float32Array | null, level: number) =>
    buildWaterGuard(
      only(sea),
      TEXEL_SPAN,
      -TEXEL_HALF,
      -TEXEL_HALF,
      TEXEL_HALF,
      TEXEL_HALF,
      7,
      level,
      { getHeights: () => heights, floor: level - 2 }
    );

  it('lets a stroke pass over water that does not show', () => {
    const land = new FakeSource(() => 30).heights;
    expect(isWaterBlocked(guardOver(land, 30), 0, 0)).toBe(false);
  });

  it('blocks hidden water that the stroke’s bed would uncover', () => {
    const land = new FakeSource(() => 30).heights;
    expect(isWaterBlocked(guardOver(land, 1), 0, 0)).toBe(true);
  });

  it('blocks water that shows', () => {
    const shore = new FakeSource(() => SWASH_REACH / 2).heights;
    expect(isWaterBlocked(guardOver(shore, 30), 0, 0)).toBe(true);
  });

  it('blocks covered water while the heights are read', () => {
    expect(isWaterBlocked(guardOver(null, 30), 0, 0)).toBe(true);
  });
});

describe('waterShowsAt', () => {
  const sea = fakeWater(() => [255, 0, 0]);
  const centre = TEXEL_HALF * TEXELS + TEXEL_HALF;

  it('shows where the footprint dips below the level plus the swash', () => {
    const hollow = new FakeSource((wx, wz) =>
      wx === 1 && wz === 0 ? SWASH_REACH - 0.1 : 30
    );
    expect(waterShowsAt(sea, hollow.heights, centre)).toBe(true);
  });

  it('is hidden where all the footprint stands above it', () => {
    const land = new FakeSource(() => SWASH_REACH);
    expect(waterShowsAt(sea, land.heights, centre)).toBe(false);
  });
});

describe('applyCarveStamp', () => {
  const carve = { centerX: 0, centerZ: 0, radius: 12, level: 10, depth: 2 };

  it('digs a bed to depth below the level at the centre', () => {
    const source = new FakeSource(() => 10);
    applyCarveStamp(source, { ...carve, amount: 1, guard: openGuard() });
    expect(source.at(0, 0)).toBeCloseTo(8);
    expect(source.at(12, 0)).toBe(10);
  });

  it('cuts into higher ground with a bank past the brush', () => {
    const source = new FakeSource(() => 30);
    applyCarveStamp(source, { ...carve, amount: 1, guard: openGuard() });
    expect(source.at(0, 0)).toBeCloseTo(8);
    expect(source.at(16, 0)).toBeCloseTo(10 + 4 * CARVE_BANK_SLOPE);
    expect(source.at(25, 0)).toBe(30);
  });

  it('never raises ground', () => {
    const source = new FakeSource(() => 0);
    const touched = applyCarveStamp(source, {
      ...carve,
      amount: 1,
      guard: openGuard(),
    });
    expect(touched).toEqual([]);
  });

  it('blends toward the bed by the amount', () => {
    const source = new FakeSource(() => 10);
    applyCarveStamp(source, { ...carve, amount: 0.5, guard: openGuard() });
    expect(source.at(0, 0)).toBeCloseTo(9);
  });

  it('leaves blocked ground alone', () => {
    const source = new FakeSource(() => 30);
    const water = fakeWater((i, j) => (i === 2 && j === 0 ? [255, 40, 3] : null));
    const guard = buildWaterGuard(
      only(water),
      TEXEL_SPAN,
      -TEXEL_HALF,
      -TEXEL_HALF,
      TEXEL_HALF,
      TEXEL_HALF,
      7,
      10
    );
    applyCarveStamp(source, { ...carve, amount: 1, guard });
    expect(source.at(2 * UNIT, 0)).toBe(30);
    expect(source.at(1 * UNIT, 0)).toBe(30);
    expect(source.at(-2 * UNIT, 0)).toBeLessThan(30);
  });
});

describe('applyWaterLip', () => {
  // The stroke's water covers the texels within 8 m of the origin.
  const water = fakeWater((i, j) =>
    Math.hypot(i * UNIT, j * UNIT) <= 8 ? [255, 10, 7] : null
  );
  const grid = (discs: number[]) =>
    buildShoreGrid(
      only(water),
      TEXEL_SPAN,
      UNIT,
      -TEXEL_HALF,
      -TEXEL_HALF,
      TEXEL_HALF,
      TEXEL_HALF,
      7,
      discs
    );

  it('raises dry ground near the water to the top, easing out', () => {
    const source = new FakeSource(() => 9);
    applyWaterLip(source, grid([0, 0, 10]), 11);
    expect(source.at(0, 0)).toBe(9);
    expect(source.at(12, 0)).toBe(11);
    const past = 8 + UNIT / 2 + WATER_LIP_WIDTH + WATER_LIP_EASE / 2;
    expect(source.at(Math.round(past), 0)).toBeGreaterThan(9);
    expect(source.at(Math.round(past), 0)).toBeLessThan(11);
    expect(source.at(40, 0)).toBe(9);
  });

  it('keeps ground already above the top', () => {
    const source = new FakeSource(() => 15);
    expect(applyWaterLip(source, grid([0, 0, 10]), 11)).toEqual([]);
  });

  it('only rises around water inside the stroke', () => {
    const source = new FakeSource(() => 9);
    expect(applyWaterLip(source, grid([100, 100, 10]), 11)).toEqual([]);
  });
});

describe('applyRaiseStamp', () => {
  // A lake at 10 m over the texels within 12 m of the origin.
  const water = fakeWater((i, j) =>
    Math.hypot(i * UNIT, j * UNIT) <= 12 ? [255, 10, 3] : null
  );
  const levels = buildWaterLevels(
    only(water),
    TEXEL_SPAN,
    -TEXEL_HALF,
    -TEXEL_HALF,
    TEXEL_HALF,
    TEXEL_HALF
  );
  const raise = { centerX: 0, centerZ: 0, radius: 12, rise: 1, levels };

  it('raises the bed above the water at the centre, to the level at the edge', () => {
    const source = new FakeSource(() => 6);
    applyRaiseStamp(source, { ...raise, amount: 1 });
    expect(source.at(0, 0)).toBeCloseTo(11);
    expect(source.at(12, 0)).toBeCloseTo(10);
    expect(source.at(14, 0)).toBe(6);
  });

  it('blends toward the land by the amount', () => {
    const source = new FakeSource(() => 6);
    applyRaiseStamp(source, { ...raise, amount: 0.5 });
    expect(source.at(0, 0)).toBeCloseTo(8.5);
  });

  it('leaves dry ground and higher ground alone', () => {
    const dry = new FakeSource(() => 6);
    applyRaiseStamp(dry, { ...raise, centerX: 30, amount: 1 });
    expect(dry.at(30, 0)).toBe(6);
    const high = new FakeSource(() => 20);
    expect(applyRaiseStamp(high, { ...raise, amount: 1 })).toEqual([]);
  });
});
