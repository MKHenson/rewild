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

// A slope gentle enough for snow to hold, and one too sheer for it — and past
// the rock band's top, so rock has fully taken over (snow releases at
// SNOW_SLOPE.from, rock saturates at ROCK_SLOPE.to; a "bare cliff" slope must
// clear both).
const GENTLE = SNOW_SLOPE.to - 10;
const SHEER = Math.max(SNOW_SLOPE.from, ROCK_SLOPE.to) + 5;

// `noise` is the value every noise-selecting layer sees; the tables under test
// here select on slope and height, so it defaults to unused.
function weightsFor(
  biome: BiomeParams,
  height: number,
  slopeDegrees: number,
  noise: number | null = null
): number[] {
  const out = new Float64Array(biome.layers.length);
  const noiseValues =
    noise === null
      ? null
      : new Float64Array(biome.layers.length).fill(noise);
  resolveLayerWeights(biome, height, slopeDegrees, noiseValues, out);
  return Array.from(out);
}

function sum(weights: number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}

describe('resolveLayerWeights', () => {
  // Its own biome rather than a table row: this is about the base case, and
  // shipped biomes gain layers as they are tuned (PLAIN has leaf litter now).
  const SOLO: BiomeParams = { ...PLAIN, layers: [{ material: 'only' }] };

  it('gives a single-layer biome all the weight', () => {
    expect(weightsFor(SOLO, 0, 0)).toEqual([1]);
    expect(weightsFor(SOLO, 500, 89)).toEqual([1]);
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

  // The reason validateClimateLayers rejects a selectorless layer above the
  // base. This is what such a table actually resolves to: coverage 1 takes the
  // whole remainder, so everything beneath it — base included — comes out 0.
  // Pinned so the validator has a documented behaviour to be protecting against
  // rather than an assertion nobody can check.
  it('buries lower layers under a selectorless layer', () => {
    const unconstrained = (materials: string[]): BiomeParams => ({
      ...PLAIN,
      layers: materials.map((material) => ({ material })),
    });

    expect(weightsFor(unconstrained(['a', 'b']), 50, 20)).toEqual([0, 1]);
    expect(weightsFor(unconstrained(['a', 'b', 'c']), 50, 20)).toEqual([
      0, 0, 1,
    ]);
  });

  describe('noise selectors', () => {
    const mottled = (band: { from: number; to: number }): BiomeParams => ({
      ...PLAIN,
      layers: [
        { material: 'base' },
        {
          material: 'patch',
          noise: { scale: 20, seedSalt: 11, band },
        },
      ],
    });

    it('splits two materials by the noise value alone', () => {
      const biome = mottled({ from: 0.45, to: 0.55 });
      // Below the band the base keeps everything; above it the patch takes all.
      expect(weightsFor(biome, 50, 20, 0.2)).toEqual([1, 0]);
      expect(weightsFor(biome, 50, 20, 0.8)).toEqual([0, 1]);
    });

    it('ramps smoothly through the band rather than snapping', () => {
      const biome = mottled({ from: 0.45, to: 0.55 });
      const mid = weightsFor(biome, 50, 20, 0.5)[1];
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      // Symmetric band, so the midpoint is an even mix.
      expect(mid).toBeCloseTo(0.5, 5);
    });

    // Inverting the band selects the other side of the same field, which is how
    // two layers share one noise field and interlock instead of overlapping.
    it('inverts with the band, selecting the opposite side of the field', () => {
      const normal = mottled({ from: 0.45, to: 0.55 });
      const inverted = mottled({ from: 0.55, to: 0.45 });
      expect(weightsFor(normal, 50, 20, 0.8)[1]).toBe(1);
      expect(weightsFor(inverted, 50, 20, 0.8)[1]).toBe(0);
      expect(weightsFor(inverted, 50, 20, 0.2)[1]).toBe(1);
    });

    // Selectors multiply, so a noise selector narrows a slope/height layer
    // rather than replacing it — the patches only appear where both agree.
    it('multiplies with the layer other selectors', () => {
      const biome: BiomeParams = {
        ...PLAIN,
        layers: [
          { material: 'base' },
          {
            material: 'patch',
            slope: { from: 10, to: 20 },
            noise: { scale: 20, seedSalt: 11, band: { from: 0.45, to: 0.55 } },
          },
        ],
      };
      // Noise says yes, slope says no.
      expect(weightsFor(biome, 50, 0, 0.8)).toEqual([1, 0]);
      // Slope says yes, noise says no.
      expect(weightsFor(biome, 50, 30, 0.2)).toEqual([1, 0]);
      // Both agree.
      expect(weightsFor(biome, 50, 30, 0.8)).toEqual([0, 1]);
    });
  });

  it('leaves array entries beyond the biome layer count untouched', () => {
    const out = new Float64Array(4).fill(-1);
    resolveLayerWeights(SOLO, 0, 0, null, out);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(-1);
  });
});
