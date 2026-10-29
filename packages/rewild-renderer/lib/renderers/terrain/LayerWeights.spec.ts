import { Vector2 } from 'rewild-common';
import {
  BiomeScatter,
  ClimateConfig,
  MOUNTAIN,
  SelectorBand,
  getClimatePalette,
} from './Biomes';
import { resolveScatterDensity } from './LayerWeights';
import { generateSplatMap } from './Splat';

// The layer rules themselves are unit tested with the Rust splat generator
// (terrain crate, `layer_weights`). These pin what the shipped mountain table
// resolves to, through the whole splat path.

// Read the selectors off the table rather than restating them: these tests are
// about what the table does, not about the values that happen to be tuned in.
const ROCK_SLOPE = MOUNTAIN.layers[1].slope as SelectorBand;
const SNOW_HEIGHT = MOUNTAIN.layers[2].height as SelectorBand;
const SNOW_SLOPE = MOUNTAIN.layers[2].slope as SelectorBand;

// A slope gentle enough for snow to hold, and one too sheer for it and past
// the rock band's top, so rock has fully taken over.
const GENTLE = SNOW_SLOPE.to - 10;
const SHEER = Math.max(SNOW_SLOPE.from, ROCK_SLOPE.to) + 5;

const ONLY_MOUNTAIN: ClimateConfig = {
  temperature: { scale: 1000, seedSalt: 1, cuts: [], blendHalfWidth: 0.1 },
  moisture: { scale: 1000, seedSalt: 2, cuts: [], blendHalfWidth: 0.1 },
  biomes: [MOUNTAIN],
  cells: [[0]],
};
const PALETTE = getClimatePalette(ONLY_MOUNTAIN);
const MATERIALS = MOUNTAIN.layers.map((layer) => layer.material);

const SIZE = 5;
const METERS_PER_SAMPLE = 2;

/**
 * Each mountain layer's weight, 0..1, in the middle of a plane `height` metres
 * up, tilted to `slopeDegrees`.
 */
function weightsFor(height: number, slopeDegrees: number): number[] {
  const rise = Math.tan((slopeDegrees * Math.PI) / 180) * METERS_PER_SAMPLE;
  const heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      heights[x + y * SIZE] = height + (x - (SIZE >> 1)) * rise;
  const splat = generateSplatMap(
    SIZE,
    SIZE,
    1,
    new Vector2(0, 0),
    ONLY_MOUNTAIN,
    heights
  );
  const centre = ((SIZE * SIZE) >> 1) * 4;
  return MATERIALS.map((m) => splat[centre + PALETTE.indexOf(m)] / 255);
}

describe('the mountain table', () => {
  const [DIRT, ROCK, SNOW] = [0, 1, 2];

  it('surfaces low flat ground as the base material', () => {
    expect(weightsFor(10, 0)).toEqual([1, 0, 0]);
  });

  it('surfaces steep ground as rock, at any altitude', () => {
    expect(weightsFor(SNOW_HEIGHT.from - 50, SHEER)[ROCK]).toBe(1);
    expect(weightsFor(SNOW_HEIGHT.to + 20, SHEER)[ROCK]).toBe(1);
  });

  it('surfaces high flat ground as snow', () => {
    expect(weightsFor(SNOW_HEIGHT.to + 20, 0)).toEqual([0, 0, 1]);
  });

  // The reason snow carries an inverted slope band: a peak that is snow all
  // the way down its cliffs reads as dipped in paint.
  it('lets rock through on high cliffs instead of snowing over them', () => {
    const cliff = weightsFor(SNOW_HEIGHT.to + 20, SHEER);
    expect(cliff[SNOW]).toBe(0);
    expect(cliff[ROCK]).toBe(1);
  });

  it('blends rather than snapping across the snow line', () => {
    const below = weightsFor(SNOW_HEIGHT.from - 10, GENTLE)[SNOW];
    const mid = weightsFor((SNOW_HEIGHT.from + SNOW_HEIGHT.to) / 2, GENTLE)[
      SNOW
    ];
    const above = weightsFor(SNOW_HEIGHT.to + 10, GENTLE)[SNOW];
    expect(below).toBe(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(above).toBe(1);
  });

  it('blends rather than snapping across the rock slope band', () => {
    const low = SNOW_HEIGHT.from - 50;
    const flat = weightsFor(low, ROCK_SLOPE.from - 5)[ROCK];
    const mid = weightsFor(low, (ROCK_SLOPE.from + ROCK_SLOPE.to) / 2)[ROCK];
    const steep = weightsFor(low, ROCK_SLOPE.to + 5)[ROCK];
    expect(flat).toBe(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(steep).toBe(1);
    expect(weightsFor(low, 0)[DIRT]).toBe(1);
  });
});

describe('resolveScatterDensity', () => {
  const rule: BiomeScatter = {
    layer: 'granite_pebble_01',
    density: 0.4,
    slope: { from: 40, to: 10 },
    height: { from: 0, to: 50 },
  };

  it('is the density scaled by the product of its selectors', () => {
    expect(resolveScatterDensity(rule, 100, 0, 0)).toBeCloseTo(0.4);
  });

  it('is zero outside any one selector', () => {
    expect(resolveScatterDensity(rule, 100, 60, 0)).toBe(0);
    expect(resolveScatterDensity(rule, -10, 0, 0)).toBe(0);
  });

  // Rules are independent fields, so nothing here caps at the biome level.
  it('ignores the noise value when the rule has no noise selector', () => {
    expect(resolveScatterDensity(rule, 100, 0, 0)).toBe(
      resolveScatterDensity(rule, 100, 0, 1)
    );
  });

  it('applies a noise selector when the rule carries one', () => {
    const noisy: BiomeScatter = {
      ...rule,
      noise: { scale: 100, seedSalt: 1, band: { from: 0.4, to: 0.6 } },
    };
    expect(resolveScatterDensity(noisy, 100, 0, 0.2)).toBe(0);
    expect(resolveScatterDensity(noisy, 100, 0, 0.8)).toBeCloseTo(0.4);
  });

  // A treeline fades in above the foothills and out again under the snow,
  // which one ramp cannot say. A pair of bands multiplies into a plateau.
  it('multiplies a pair of bands into a plateau', () => {
    const treeline: BiomeScatter = {
      ...rule,
      height: [
        { from: 40, to: 100 },
        { from: 150, to: 110 },
      ],
    };
    expect(resolveScatterDensity(treeline, 20, 0, 0)).toBe(0);
    expect(resolveScatterDensity(treeline, 70, 0, 0)).toBeCloseTo(0.2);
    expect(resolveScatterDensity(treeline, 105, 0, 0)).toBeCloseTo(0.4);
    expect(resolveScatterDensity(treeline, 130, 0, 0)).toBeCloseTo(0.2);
    expect(resolveScatterDensity(treeline, 160, 0, 0)).toBe(0);
  });
});
