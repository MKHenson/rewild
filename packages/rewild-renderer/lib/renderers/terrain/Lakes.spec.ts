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
  findLakes,
  inspectLakeCells,
  lakeSpaceToWorld,
  worldToLakeSpace,
} from './Lakes';
import { generateBiomeBlendedHeightMap } from './Noise';
import { SCATTER_INSTANCE_STRIDE, scatterChunk } from './Scatter';
import { buildWaterMap } from './WaterMap';
import { LAKE_WATER, getWaterTypeIndex } from './Water';
import { fromFloat16 } from '../../utils/float16';

// The lake rules are tested in Rust (crates/terrain/src/tests.rs). These pin
// the shipped presets through the WASM boundary.

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

  it('makes no lakes without a lake config', () => {
    expect(lakesIn({ ...INLAND, lakes: undefined })).toEqual([]);
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

describe('lake chunks', () => {
  const lake = lakesIn(INLAND).find((l) => !l.tarn)!;
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
    const lakes = { ...DEFAULT_LAKES, cellSize: DEFAULT_LAKES.radius.to };
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
    expect(lagoon.lip).toBe(-Infinity);
    expect(Number.isNaN(lagoon.mouth)).toBe(false);
  });

  it('owns the water at its centre in the water map', () => {
    const offset = offsetOver(lagoon);
    const heights = generateBiomeBlendedHeightMap(BIG, BIG, SEED, offset, COAST, 0);
    const water = buildWaterMap(BIG, SEED, offset, COAST, 0, heights)!;
    const lakeType = getWaterTypeIndex(COAST, LAKE_WATER);
    const t = (water.size - 1) / 2;
    const centre = t + t * water.size;
    expect(water.bodyIds[centre]).toBe(lagoon.bodyId);
    expect(water.baseLevel + fromFloat16(water.level[centre])).toBeCloseTo(0, 2);
    expect(water.typeWeights[centre * 4 + lakeType]).toBeGreaterThan(0);
    expect(water.bodies.map((b) => b.id)).toContain(lagoon.bodyId);
  });
});
