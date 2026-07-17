import { BiomeParams, MOUNTAIN, PLAIN } from './Biomes';
import { resolveLayerWeights } from './LayerWeights';

// Layer indices in MOUNTAIN.layers.
const DIRT = 0;
const ROCK = 1;
const SNOW = 2;

// Read the selectors off the table rather than restating them: these tests are
// about how layers compose, not about the values that happen to be tuned in.
const SNOW_HEIGHT = MOUNTAIN.layers[SNOW].height!;
const SNOW_SLOPE = MOUNTAIN.layers[SNOW].slope!;
const ROCK_SLOPE = MOUNTAIN.layers[ROCK].slope!;

// A slope gentle enough for snow to hold, and one too sheer for it.
const GENTLE = SNOW_SLOPE.to - 10;
const SHEER = SNOW_SLOPE.from + 15;

function weightsFor(
  biome: BiomeParams,
  height: number,
  slopeDegrees: number
): number[] {
  const out = new Float64Array(biome.layers.length);
  resolveLayerWeights(biome, height, slopeDegrees, out);
  return Array.from(out);
}

function sum(weights: number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}

describe('resolveLayerWeights', () => {
  it('gives a single-layer biome all the weight', () => {
    expect(weightsFor(PLAIN, 0, 0)).toEqual([1]);
    expect(weightsFor(PLAIN, 500, 89)).toEqual([1]);
  });

  it('always sums to 1, across the whole height/slope domain', () => {
    for (let height = 0; height <= 200; height += 10) {
      for (let slope = 0; slope <= 90; slope += 5) {
        expect(sum(weightsFor(MOUNTAIN, height, slope))).toBeCloseTo(1, 10);
      }
    }
  });

  it('never produces a negative weight', () => {
    for (let height = 0; height <= 200; height += 10) {
      for (let slope = 0; slope <= 90; slope += 5) {
        for (const w of weightsFor(MOUNTAIN, height, slope)) {
          expect(w).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  describe('the mountain table', () => {
    it('surfaces low flat ground as the base material', () => {
      const w = weightsFor(MOUNTAIN, 10, 0);
      expect(w[DIRT]).toBe(1);
      expect(w[ROCK]).toBe(0);
      expect(w[SNOW]).toBe(0);
    });

    it('surfaces steep ground as rock, at any altitude', () => {
      const steep = ROCK_SLOPE.to + 15;
      expect(weightsFor(MOUNTAIN, SNOW_HEIGHT.from - 50, steep)[ROCK]).toBe(1);
      expect(weightsFor(MOUNTAIN, SNOW_HEIGHT.to + 20, steep)[ROCK]).toBe(1);
    });

    it('surfaces high flat ground as snow', () => {
      const w = weightsFor(MOUNTAIN, SNOW_HEIGHT.to + 20, 0);
      expect(w[SNOW]).toBe(1);
      expect(w[ROCK]).toBe(0);
      expect(w[DIRT]).toBe(0);
    });

    // The reason snow carries an inverted slope band: a peak that is snow all
    // the way down its cliffs reads as dipped in paint.
    it('lets rock through on high cliffs instead of snowing over them', () => {
      const cliff = weightsFor(MOUNTAIN, SNOW_HEIGHT.to + 20, SHEER);
      expect(cliff[SNOW]).toBe(0);
      expect(cliff[ROCK]).toBe(1);
    });

    it('blends rather than snapping across the snow line', () => {
      const below = weightsFor(MOUNTAIN, SNOW_HEIGHT.from - 10, GENTLE)[SNOW];
      const mid = weightsFor(
        MOUNTAIN,
        (SNOW_HEIGHT.from + SNOW_HEIGHT.to) / 2,
        GENTLE
      )[SNOW];
      const above = weightsFor(MOUNTAIN, SNOW_HEIGHT.to + 10, GENTLE)[SNOW];

      expect(below).toBe(0);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      expect(above).toBe(1);
    });

    it('blends rather than snapping across the rock slope band', () => {
      const low = SNOW_HEIGHT.from - 50;
      const flat = weightsFor(MOUNTAIN, low, ROCK_SLOPE.from - 5)[ROCK];
      const mid = weightsFor(
        MOUNTAIN,
        low,
        (ROCK_SLOPE.from + ROCK_SLOPE.to) / 2
      )[ROCK];
      const steep = weightsFor(MOUNTAIN, low, ROCK_SLOPE.to + 5)[ROCK];

      expect(flat).toBe(0);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      expect(steep).toBe(1);
    });

    // A partially-covering top layer must leave room for what is beneath it,
    // not scale everything down proportionally.
    it('lets a partial top layer reveal the layers under it', () => {
      const w = weightsFor(MOUNTAIN, SNOW_HEIGHT.to + 20, SHEER);
      expect(w[SNOW]).toBe(0); // too steep for snow
      expect(w[ROCK]).toBe(1); // ...so the rock beneath takes it all
    });
  });

  it('leaves array entries beyond the biome layer count untouched', () => {
    const out = new Float64Array(4).fill(-1);
    resolveLayerWeights(PLAIN, 0, 0, out);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(-1);
  });
});
