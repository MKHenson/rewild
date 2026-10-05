import { SculptHeightSource } from './Sculpt';
import {
  SHORE_CREST,
  SHORE_RISE,
  applyCarveStamp,
  applyCutBank,
  applyWaterLip,
  buildCutGrid,
  buildShoreGrid,
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
  // A 12 m shoreline at level 10, 2 m deep at the centre.
  const carve = {
    centerX: 0,
    centerZ: 0,
    radius: 12,
    level: 10,
    depth: 2,
    amount: 1,
    original: () => null,
    targets: () => null,
  };
  const bed = () => new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(Infinity);

  it('digs a bowl to depth below the level, steepest at the shore', () => {
    const source = new FakeSource(() => 10);
    applyCarveStamp(source, { ...carve, guard: openGuard() });
    expect(source.at(0, 0)).toBeCloseTo(8);
    expect(source.at(6, 0)).toBeCloseTo(8.5);
    expect(source.at(12, 0)).toBe(10);
  });

  it('rises from the level to higher ground across the shore apron', () => {
    const source = new FakeSource(() => 30);
    applyCarveStamp(source, { ...carve, guard: openGuard() });
    expect(source.at(12, 0)).toBeCloseTo(10);
    expect(source.at(22, 0)).toBeCloseTo(18.75);
    expect(source.at(34, 0)).toBeCloseTo(25.95);
  });

  it('never raises ground', () => {
    const source = new FakeSource(() => 0);
    expect(applyCarveStamp(source, { ...carve, guard: openGuard() })).toEqual(
      []
    );
  });

  it('digs toward the lowest of the stroke’s shapes', () => {
    const source = new FakeSource(() => 30);
    const start = source.heights.slice();
    const targets = bed();
    const stroke = {
      ...carve,
      original: () => start,
      targets: () => targets,
    };
    applyCarveStamp(source, { ...stroke, guard: openGuard() });
    applyCarveStamp(source, { ...stroke, centerX: 8, guard: openGuard() });
    expect(source.at(8, 0)).toBeCloseTo(8);
    expect(source.at(0, 0)).toBeCloseTo(8);

    const before = source.heights.slice();
    applyCarveStamp(source, { ...stroke, guard: openGuard() });
    expect(Array.from(source.heights)).toEqual(Array.from(before));
  });

  it('deepens by the amount with each stamp', () => {
    const source = new FakeSource(() => 10);
    const targets = bed();
    const stroke = {
      ...carve,
      amount: 0.5,
      targets: () => targets,
      guard: openGuard(),
    };
    applyCarveStamp(source, stroke);
    expect(source.at(0, 0)).toBeCloseTo(9);
    applyCarveStamp(source, stroke);
    expect(source.at(0, 0)).toBeCloseTo(8.5);
  });

  it('leaves blocked ground alone', () => {
    const source = new FakeSource(() => 30);
    const water = fakeWater((i, j) =>
      i === 2 && j === 0 ? [255, 40, 3] : null
    );
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
    applyCarveStamp(source, { ...carve, guard });
    expect(source.at(2 * UNIT, 0)).toBe(30);
    expect(source.at(1 * UNIT, 0)).toBe(30);
    expect(source.at(-2 * UNIT, 0)).toBeLessThan(30);
  });
});

describe('applyWaterLip', () => {
  // A stamp on body 7 at level 10 with a 4 m shoreline.
  const discs = [0, 0, 4];
  const noWater = fakeWater(() => null);
  const lip = (
    water: ResolvedWater,
    before: (wx: number, wz: number) => number = () => 9,
    now: (wx: number, wz: number) => number = before
  ) => {
    const start = new FakeSource(before);
    const source = new FakeSource(now);
    const grid = buildShoreGrid(
      only(water),
      () => start.heights,
      TEXEL_SPAN,
      -TEXEL_HALF,
      -TEXEL_HALF,
      TEXEL_HALF,
      TEXEL_HALF,
      7
    );
    const touched = applyWaterLip(
      source,
      grid,
      discs,
      10,
      1,
      () => start.heights
    );
    return { source, touched };
  };

  it('rises steeply from the shoreline, holds past the coverage, then eases to the ground', () => {
    const { source } = lip(noWater);
    expect(source.at(0, 0)).toBe(9);
    expect(source.at(7, 0)).toBeCloseTo(10.75);
    expect(source.at(4 + SHORE_RISE, 0)).toBe(11);
    expect(source.at(Math.floor(4 + SHORE_CREST), 0)).toBe(11);
    expect(source.at(36, 0)).toBeGreaterThan(9);
    expect(source.at(36, 0)).toBeLessThan(11);
  });

  it('follows the outline, not the texels', () => {
    const { source } = lip(noWater);
    expect(Math.abs(source.at(0, -7) - source.at(-5, -5))).toBeLessThan(0.2);
  });

  it('keeps ground already above the top', () => {
    expect(lip(noWater, () => 15).touched).toEqual([]);
  });

  it('leaves its own lake as it was, judged by the ground before the stroke', () => {
    const lake = fakeWater((i, j) =>
      Math.hypot(i * UNIT, j * UNIT) <= 8 ? [255, 10, 7] : null
    );
    const { source } = lip(lake, (wx) => (wx >= 6 ? 10.5 : 9));
    expect(source.at(0, -6)).toBe(9);
    expect(source.at(7, 0)).toBeCloseTo(10.75);
  });

  it('stays out of another body’s water that shows', () => {
    const other = fakeWater((i, j) =>
      i === 0 && j === 4 ? [255, 30, 3] : null
    );
    const { source } = lip(other);
    expect(source.at(0, 16)).toBe(9);
    expect(source.at(0, -16)).toBe(11);
  });

  it('rises under another body’s covered water that does not show', () => {
    const { source } = lip(fakeWater(() => [255, 0, 0]));
    expect(source.at(16, 0)).toBe(11);
  });

  it('eases back to the ground as it stood before the stroke, not as carved', () => {
    const { source } = lip(
      noWater,
      () => 20,
      () => 12
    );
    expect(source.at(36, 0)).toBeGreaterThan(15);
  });
});

describe('remove stroke cut', () => {
  // A remove circle at (28, 0) with a 20 m radius: its outline crosses the
  // axis at x = 8. Edited lake water at level 10 covers x <= 16, and a pond
  // stands at x = 28 in the circle's middle.
  const discs = [28, 0, 20];
  const lake = fakeWater((i, j) =>
    i * UNIT <= 16 || (i === 7 && j === 0) ? [255, 10, 7] : null
  );
  const cut = (
    water: ResolvedWater = lake,
    generated: ResolvedWater = fakeWater(() => null)
  ) =>
    buildCutGrid(
      only(water),
      only(generated),
      TEXEL_SPAN,
      UNIT,
      -TEXEL_HALF,
      -TEXEL_HALF,
      TEXEL_HALF,
      TEXEL_HALF,
      discs
    );
  const levelAt = (grid: ReturnType<typeof cut>, i: number, j: number) =>
    grid.level[(j - grid.j0) * grid.width + (i - grid.i0)];

  it('keeps water outside the circle and joined to it within the margin', () => {
    const grid = cut();
    expect(levelAt(grid, -5, 0)).toBe(10);
    expect(levelAt(grid, 3, 0)).toBe(10);
    expect(levelAt(grid, 4, 0)).toBe(10);
  });

  it('releases edited water inside the circle that does not stay', () => {
    const grid = cut();
    expect(Number.isNaN(levelAt(grid, 7, 0))).toBe(true);
    expect(grid.released).toEqual([7, 0]);
  });

  it('leaves water the generator makes alone', () => {
    const grid = cut(lake, lake);
    expect(Number.isNaN(levelAt(grid, -5, 0))).toBe(true);
    expect(grid.released).toEqual([]);
  });

  it('banks the cut from the water level at the outline to the top', () => {
    const source = new FakeSource(() => 8);
    applyCutBank(source, cut(), discs, 1);
    expect(source.at(0, 0)).toBe(8);
    expect(source.at(8, 0)).toBe(8);
    expect(source.at(8 + SHORE_RISE, 0)).toBe(11);
    expect(source.at(28, 0)).toBe(11);
  });

  it('leaves ground under other water alone', () => {
    const pond = fakeWater((i, j) => (i === 7 && j === 0 ? [255, 5, 3] : null));
    const lakeAndPond = fakeWater((i, j) =>
      i * UNIT <= 16 ? [255, 10, 7] : i === 7 && j === 0 ? [255, 5, 3] : null
    );
    const source = new FakeSource(() => 3);
    applyCutBank(source, cut(lakeAndPond, pond), discs, 1);
    expect(source.at(28, 0)).toBe(3);
    expect(source.at(8 + SHORE_RISE, 0)).toBe(11);
  });

  it('raises nothing where no water stays', () => {
    const source = new FakeSource(() => 8);
    expect(applyCutBank(source, cut(fakeWater(() => null)), discs, 1)).toEqual(
      []
    );
  });
});
