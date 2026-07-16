import { BiomeParams, MOUNTAIN, PLAIN } from './Biomes';
import { resolveLayerWeights } from './LayerWeights';

// Layer indices in MOUNTAIN.layers.
const DIRT = 0;
const ROCK = 1;
const SNOW = 2;

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
      expect(weightsFor(MOUNTAIN, 10, 60)[ROCK]).toBe(1);
      expect(weightsFor(MOUNTAIN, 190, 60)[ROCK]).toBe(1);
    });

    it('surfaces high flat ground as snow', () => {
      const w = weightsFor(MOUNTAIN, 190, 0);
      expect(w[SNOW]).toBe(1);
      expect(w[ROCK]).toBe(0);
      expect(w[DIRT]).toBe(0);
    });

    // The reason snow carries an inverted slope band: a peak that is snow all
    // the way down its cliffs reads as dipped in paint.
    it('lets rock through on high cliffs instead of snowing over them', () => {
      const cliff = weightsFor(MOUNTAIN, 190, 70);
      expect(cliff[SNOW]).toBe(0);
      expect(cliff[ROCK]).toBe(1);
    });

    it('blends rather than snapping across the snow line', () => {
      const below = weightsFor(MOUNTAIN, 110, 0)[SNOW];
      const mid = weightsFor(MOUNTAIN, 145, 0)[SNOW];
      const above = weightsFor(MOUNTAIN, 180, 0)[SNOW];

      expect(below).toBe(0);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      expect(above).toBe(1);
    });

    it('blends rather than snapping across the rock slope band', () => {
      const flat = weightsFor(MOUNTAIN, 10, 20)[ROCK];
      const mid = weightsFor(MOUNTAIN, 10, 35)[ROCK];
      const steep = weightsFor(MOUNTAIN, 10, 50)[ROCK];

      expect(flat).toBe(0);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      expect(steep).toBe(1);
    });

    // A partially-covering top layer must leave room for what is beneath it,
    // not scale everything down proportionally.
    it('lets a partial top layer reveal the layers under it', () => {
      const w = weightsFor(MOUNTAIN, 145, 60);
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
