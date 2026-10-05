import { Vector2 } from 'rewild-common';
import {
  BiomeParams,
  BiomeScatter,
  ClimateConfig,
  DEFAULT_CLIMATE,
  DEFAULT_CONTINENT,
  DEFAULT_LAKES,
  PLAIN,
  validateClimateLayers,
} from './Biomes';
import {
  Lake,
  OCEAN_BODY_ID,
  carveLakeHeight,
  findLakes,
  inspectLakeCells,
  lakeDistance,
  lakeSpaceToWorld,
  maxLakeReach,
  worldToLakeSpace,
} from './Lakes';
import { createGroundSampler, generateBiomeBlendedHeightMap, sampleGround } from './Noise';
import { SCATTER_INSTANCE_STRIDE, scatterChunk } from './Scatter';
import { buildWaterMap } from './WaterMap';
import { LAKE_WATER, OCEAN_WATER, getWaterTypeIndex } from './Water';
import { fromFloat16 } from '../../utils/float16';
import { oceanCoverage, sampleContinent } from './ClimateField';

const SEED = 9001;
const SIZE = 129;

const INLAND: ClimateConfig = {
  ...DEFAULT_CLIMATE,
  continent: { ...DEFAULT_CONTINENT, coast: -1 },
  lakes: { ...DEFAULT_LAKES, chance: 1 },
};

const AREA = DEFAULT_LAKES.cellSize * 6;

function lakesIn(climate: ClimateConfig, seed = SEED): Lake[] {
  return findLakes(seed, climate, 0, -AREA, -AREA, AREA, AREA);
}

const isTarn = (lake: Lake) => lake.radius < DEFAULT_LAKES.radius.from;

// The lake-space point `d` shore radii from the centre toward `angle`.
function along(lake: Lake, angle: number, d: number): [number, number] {
  const unit = lakeDistance(lake, lake.u + Math.cos(angle), lake.v + Math.sin(angle));
  return [lake.u + (Math.cos(angle) * d) / unit, lake.v + (Math.sin(angle) * d) / unit];
}

// A chunk offset whose centre sample sits on the lake's centre.
function offsetOver(lake: Lake): Vector2 {
  return new Vector2(Math.round(lake.u), -Math.round(lake.v));
}

function heightsAt(offset: Vector2, climate = INLAND): Float32Array {
  return generateBiomeBlendedHeightMap(SIZE, SIZE, SEED, offset, climate, 0);
}

describe('findLakes', () => {
  const lakes = lakesIn(INLAND);

  it('finds lakes, and the same ones every time', () => {
    expect(lakes.length).toBeGreaterThan(0);
    expect(lakesIn(INLAND)).toEqual(lakes);
  });

  it('finds a lake from any box it reaches', () => {
    const lake = lakes[0];
    const found = findLakes(SEED, INLAND, 0, lake.u, lake.v, lake.u + 1, lake.v + 1);
    expect(found.map((l) => l.bodyId)).toEqual([lake.bodyId]);
  });

  it('keeps neighbouring lakes a shore apart', () => {
    for (let i = 0; i < lakes.length; i++)
      for (let j = i + 1; j < lakes.length; j++) {
        const a = lakes[i];
        const b = lakes[j];
        const gap = Math.hypot(a.u - b.u, a.v - b.v) - a.reach - b.reach;
        expect(gap).toBeGreaterThanOrEqual(DEFAULT_LAKES.spacing);
      }
  });

  it('levels each lake below every rim sample', () => {
    const ground = createGroundSampler(SEED, INLAND, 0);
    for (const lake of lakes.filter((l) => !isTarn(l)))
      for (let k = 0; k < 24; k++) {
        const [u, v] = along(lake, (k / 24) * Math.PI * 2, lake.bank);
        expect(sampleGround(ground, u, v)).toBeGreaterThanOrEqual(
          lake.level + DEFAULT_LAKES.margin - 1e-6
        );
      }
  });

  it('holds every lake in behind its bank', () => {
    const ground = createGroundSampler(SEED, INLAND, 0);
    for (const lake of lakes)
      for (let k = 0; k < 48; k++) {
        const angle = (k / 48) * Math.PI * 2;
        for (const d of [1.2, 1.5, lake.bank]) {
          const [u, v] = along(lake, angle, d);
          const h = carveLakeHeight(lake, u, v, sampleGround(ground, u, v));
          expect(h).toBeGreaterThanOrEqual(lake.level - 1e-3);
        }
        const [u, v] = along(lake, angle, lake.bank);
        expect(carveLakeHeight(lake, u, v, sampleGround(ground, u, v))).toBeGreaterThanOrEqual(
          lake.lip - 1e-3
        );
      }
  });

  it('settles tarns part way up a steep rim', () => {
    const tarns = lakes.filter(isTarn);
    expect(tarns.length).toBeGreaterThan(0);
    const ground = createGroundSampler(SEED, INLAND, 0);
    for (const tarn of tarns) {
      let lowest = Infinity;
      for (let k = 0; k < 24; k++) {
        const [u, v] = along(tarn, (k / 24) * Math.PI * 2, tarn.bank);
        lowest = Math.min(lowest, sampleGround(ground, u, v));
      }
      expect(tarn.level).toBeGreaterThanOrEqual(lowest - 1e-6);
    }
  });

  it('gives every lake its own body', () => {
    const ids = new Set(lakes.map((lake) => lake.bodyId));
    expect(ids.size).toBe(lakes.length);
    expect(ids.has(OCEAN_BODY_ID)).toBe(false);
  });

  it('makes no lakes under the ocean or without a lake config', () => {
    const ocean = { ...INLAND, continent: { ...DEFAULT_CONTINENT, coast: 2 } };
    expect(lakesIn(ocean)).toEqual([]);
    expect(lakesIn({ ...INLAND, lakes: undefined })).toEqual([]);
  });

  it('rejects every site when no rim may vary', () => {
    const flatOnly = {
      ...INLAND,
      lakes: { ...INLAND.lakes!, maxRimSlope: 0, tarns: undefined },
    };
    expect(lakesIn(flatOnly)).toEqual([]);
  });

  it('tries a tarn only where a lake is too steep', () => {
    const tarnsOnly = { ...INLAND, lakes: { ...INLAND.lakes!, maxRimSlope: 0 } };
    const found = lakesIn(tarnsOnly);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(isTarn)).toBe(true);
  });
});

describe('inspectLakeCells', () => {
  it('reports every cell, and settles the lakes findLakes finds', () => {
    const size = DEFAULT_LAKES.cellSize;
    const reports = inspectLakeCells(SEED, INLAND, 0, 0, 0, size * 3 - 1, size * 3 - 1);
    expect(reports.length).toBe(9);
    const settled = reports.filter((r) => r.lake).map((r) => r.lake!.bodyId);
    const found = findLakes(SEED, INLAND, 0, 0, 0, size * 3 - 1, size * 3 - 1)
      .filter((l) => l.cellX >= 0 && l.cellX < 3 && l.cellY >= 0 && l.cellY < 3)
      .map((l) => l.bodyId);
    expect(settled.sort()).toEqual(found.sort());
    for (const r of reports)
      expect(r.outcome === 'tarn' || r.outcome === 'lake').toBe(r.lake !== null);
  });
});

describe('lake space', () => {
  it('round-trips world metres', () => {
    const lake = new Float64Array(2);
    const world = new Float64Array(2);
    worldToLakeSpace(1234.5, -678.25, lake);
    lakeSpaceToWorld(lake[0], lake[1], world);
    expect(world[0]).toBeCloseTo(1234.5, 9);
    expect(world[1]).toBeCloseTo(-678.25, 9);
  });

  it('puts a chunk sample where the height generator reads it', () => {
    // Chunk (1, 2) of 241 samples at 2 m: sample (x, y) sits at world
    // (cx·480 + (x − 120)·2, cy·480 + (120 − y)·2).
    const out = new Float64Array(2);
    worldToLakeSpace(480 + (10 - 120) * 2, 960 + (120 - 30) * 2, out);
    expect(out[0]).toBeCloseTo(10 - 241 / 2 + 240, 9);
    expect(out[1]).toBeCloseTo(30 - 241 / 2 - 480, 9);
  });
});

describe('carveLakeHeight', () => {
  const lake = lakesIn(INLAND).find((l) => !isTarn(l))!;

  it('digs the bed to its depth at the centre and leaves ground past the bank', () => {
    expect(carveLakeHeight(lake, lake.u, lake.v, 500)).toBeCloseTo(lake.level - lake.depth, 6);
    const far = lake.u + lake.reach + 1;
    expect(carveLakeHeight(lake, far, lake.v, 500)).toBe(500);
  });

  it('meets the level at the shore', () => {
    const shore = lake.radius * 1.0;
    const u = lake.u + shore;
    const d = lakeDistance(lake, u, lake.v);
    const atShore = lake.u + shore / d;
    expect(carveLakeHeight(lake, atShore, lake.v, 500)).toBeCloseTo(lake.level, 3);
  });
});

describe('lake chunks', () => {
  const lake = lakesIn(INLAND).find((l) => !isTarn(l))!;
  const offset = offsetOver(lake);
  const heights = heightsAt(offset);
  const centre = (SIZE - 1) / 2;

  it('carves the generated ground', () => {
    expect(heights[centre + centre * SIZE]).toBeLessThan(lake.level);
  });

  it('matches its neighbours along shared edges', () => {
    const right = heightsAt(new Vector2(offset.x + SIZE - 1, offset.y));
    const below = heightsAt(new Vector2(offset.x, offset.y - (SIZE - 1)));
    for (let i = 0; i < SIZE; i++) {
      expect(right[i * SIZE]).toBe(heights[SIZE - 1 + i * SIZE]);
      expect(below[i]).toBe(heights[i + (SIZE - 1) * SIZE]);
    }
  });

  it('fills the water map with lake water at the lake level', () => {
    const water = buildWaterMap(SIZE, SEED, offset, INLAND, 0, heights)!;
    expect(water).not.toBeNull();
    const t = (water.size - 1) / 2;
    const texel = t + t * water.size;
    expect(water.coverage[texel]).toBe(255);
    expect(water.bodyIds[texel]).toBe(lake.bodyId);
    expect(water.baseLevel + fromFloat16(water.level[texel])).toBeCloseTo(lake.level, 1);
    const lakeType = getWaterTypeIndex(INLAND, LAKE_WATER);
    expect(water.typeWeights[texel * 4 + lakeType]).toBe(255);
  });

  it('records the lake as a body', () => {
    const water = buildWaterMap(SIZE, SEED, offset, INLAND, 0, heights)!;
    const body = water.bodies.find((b) => b.id === lake.bodyId)!;
    expect(body).toBeDefined();
    expect(body.level).toBe(lake.level);
    expect(body.spillHeight).toBe(lake.spillHeight);
    expect(body.spillHeight).toBeGreaterThan(body.level);
    expect(body.typeWeights[getWaterTypeIndex(INLAND, LAKE_WATER)]).toBe(1);
    expect(water.bodies.some((b) => b.id === OCEAN_BODY_ID)).toBe(false);
  });

  it('keeps land scatter out of the lake and lets underwater scatter in', () => {
    const withRule = (rule: Partial<BiomeScatter>): ClimateConfig => {
      const biome: BiomeParams = {
        ...PLAIN,
        scatter: [{ layer: 'granite_01', density: 1, ...rule }],
      };
      return { ...INLAND, biomes: [biome], cells: [[0], [0], [0]] };
    };
    const lowest = (climate: ClimateConfig) => {
      let min = Infinity;
      for (const layer of scatterChunk(SIZE, SEED, offset, climate, heights, {
        seaLevel: 0,
      }))
        for (let i = 0; i < layer.count; i++)
          min = Math.min(min, layer.data[i * SCATTER_INSTANCE_STRIDE + 1]);
      return min;
    };

    expect(lowest(withRule({}))).toBeGreaterThanOrEqual(lake.level - 0.5);
    expect(lowest(withRule({ underwater: true }))).toBeLessThan(lake.level - 1);
  });
});

describe('lake validation', () => {
  it('needs a lake water type', () => {
    const climate = {
      ...INLAND,
      water: DEFAULT_CLIMATE.water!.filter((type) => type.name !== LAKE_WATER),
    };
    expect(() => validateClimateLayers(climate)).toThrow(/lake/);
  });

  it('keeps a lake inside one cell of reach', () => {
    const lakes = { ...DEFAULT_LAKES, cellSize: maxLakeReach(DEFAULT_LAKES) };
    expect(() => validateClimateLayers({ ...INLAND, lakes })).toThrow(/cell/);
  });
});

describe('lagoons', () => {
  const COAST: ClimateConfig = {
    ...DEFAULT_CLIMATE,
    lakes: { ...DEFAULT_LAKES, chance: 1 },
  };
  const BIG = 257;
  const lagoon = lakesIn(COAST).find((l) => l.lagoon)!;

  it('opens to the sea at sea level', () => {
    expect(lagoon).toBeDefined();
    expect(lagoon.level).toBe(0);
    expect(lagoon.spillHeight).toBe(0);
    expect(lagoon.tarn).toBe(false);
    expect(carveLakeHeight(lagoon, lagoon.u + lagoon.reach * 0.99, lagoon.v, -3)).toBe(-3);
  });

  it('opens only where the sea stands on its rim', () => {
    const ground = createGroundSampler(SEED, COAST, 0);
    const found = lakesIn(COAST);
    expect(found.some((l) => l.lagoon)).toBe(true);
    for (const lake of found) {
      let sea = false;
      for (let k = 0; k < 24; k++) {
        const angle = (k / 24) * Math.PI * 2;
        const r =
          lakeDistance(lake, lake.u + Math.cos(angle), lake.v + Math.sin(angle));
        const u = lake.u + (Math.cos(angle) * lake.bank) / r;
        const v = lake.v + (Math.sin(angle) * lake.bank) / r;
        if (
          sampleGround(ground, u, v) < 0 &&
          oceanCoverage(COAST.continent!, sampleContinent(ground.field, u, v)) > 0
        )
          sea = true;
      }
      expect(lake.lagoon).toBe(sea);
    }
  });

  it('cuts a mouth below sea level from the shore to the sea', () => {
    const ground = createGroundSampler(SEED, COAST, 0);
    for (const l of lakesIn(COAST).filter((l) => l.lagoon)) {
      expect(Number.isNaN(l.mouth)).toBe(false);
      for (let d = 1; d <= l.bank; d += 0.05) {
        const [u, v] = along(l, l.mouth, d);
        expect(carveLakeHeight(l, u, v, sampleGround(ground, u, v))).toBeLessThan(0);
      }
    }
  });

  it('settles no lake out at sea', () => {
    const ground = createGroundSampler(SEED, COAST, 0);
    for (const lake of lakesIn(COAST))
      if (sampleGround(ground, lake.u, lake.v) < 0) expect(lake.lagoon).toBe(true);
  });

  it('blends from lake water at the centre to sea water at the shore', () => {
    const offset = offsetOver(lagoon);
    const heights = generateBiomeBlendedHeightMap(BIG, BIG, SEED, offset, COAST, 0);
    const water = buildWaterMap(BIG, SEED, offset, COAST, 0, heights)!;
    const lakeType = getWaterTypeIndex(COAST, LAKE_WATER);
    const oceanType = getWaterTypeIndex(COAST, OCEAN_WATER);
    const originU = offset.x - BIG / 2;
    const originV = -offset.y - BIG / 2;
    const texelAt = (u: number, v: number) => {
      const mx = Math.round((u - originU) / water.step);
      const my = Math.round((v - originV) / water.step);
      return mx + my * water.size;
    };

    const centre = texelAt(lagoon.u, lagoon.v);
    expect(water.bodyIds[centre]).toBe(lagoon.bodyId);
    expect(water.baseLevel + fromFloat16(water.level[centre])).toBeCloseTo(0, 2);
    expect(water.typeWeights[centre * 4 + lakeType]).toBeGreaterThan(
      water.typeWeights[centre * 4 + oceanType]
    );

    const [u, v] = along(lagoon, 0, 0.95);
    const shore = texelAt(u, v);
    expect(water.typeWeights[shore * 4 + oceanType]).toBeGreaterThan(
      water.typeWeights[shore * 4 + lakeType]
    );
    expect(water.bodies.map((b) => b.id)).toContain(lagoon.bodyId);
  });
});
