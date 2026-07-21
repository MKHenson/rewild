import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  DEFAULT_CLIMATE,
  MOUNTAIN,
  PLAIN,
  getClimatePalette,
} from './Biomes';
import { generateBiomeBlendedHeightMap } from './Noise';
import { generateSplatMap } from './Splat';

const SIZE = 32;
const SEED = 1234;

// Splat channel per material, read off the tables rather than hardcoded — the
// mountain's base material and the exact rock/snow names are tuning, and these
// tests are about how layers land on terrain, not which textures are chosen.
const PALETTE = getClimatePalette(DEFAULT_CLIMATE);
const channelOf = (material: string) => PALETTE.indexOf(material);

const GRASS = channelOf(PLAIN.layers[0].material);
const BASE = channelOf(MOUNTAIN.layers[0].material); // mountain's base ground
const ROCK = channelOf(MOUNTAIN.layers[1].material); // slope layer
const SNOW = channelOf(MOUNTAIN.layers[2].material); // height layer

// A 32-sample chunk is tiny against the climate's 3000-unit scale, so a whole
// test chunk falls in one climate cell — which cell being an accident of the
// seed. Layer-selection tests pin the biome instead of hoping for one.
function climateOfOneBiome(biomeIndex: number): ClimateConfig {
  return {
    temperature: {
      scale: 3000,
      seedSalt: 7919,
      cuts: [],
      blendHalfWidth: 0.05,
    },
    moisture: { scale: 2400, seedSalt: 104729, cuts: [], blendHalfWidth: 0.05 },
    biomes: [PLAIN, MOUNTAIN],
    cells: [[biomeIndex]],
  };
}

const MOUNTAIN_ONLY = climateOfOneBiome(1);
const PLAIN_ONLY = climateOfOneBiome(0);

// Read snow's selectors off the table rather than restating them — these tests
// are about layer selection, not about the values that happen to be tuned in.
const SNOW_HEIGHT = MOUNTAIN.layers[2].height!;
const SNOW_SLOPE = MOUNTAIN.layers[2].slope!;
const ROCK_SLOPE = MOUNTAIN.layers[1].slope!;
const DEG_TO_RAD = Math.PI / 180;

// A slope past the top of the rock band (and past where snow releases), so rock
// has fully taken over — a "bare cliff". Read off the table so it tracks tuning.
const CLIFF_SLOPE = Math.max(SNOW_SLOPE.from, ROCK_SLOPE.to) + 5;

function splatFor(
  heights: Float32Array,
  climate: ClimateConfig = DEFAULT_CLIMATE,
  offset = new Vector2(0, 0)
) {
  return generateSplatMap(SIZE, SIZE, SEED, offset, climate, heights);
}

function flat(value: number): Float32Array {
  return new Float32Array(SIZE * SIZE).fill(value);
}

// Weight of channel `c` at sample (x, y), as a 0..255 byte.
function at(splat: Uint8Array, x: number, y: number, c: number): number {
  return splat[(x + y * SIZE) * 4 + c];
}

describe('generateSplatMap', () => {
  it('rejects a heightfield that does not match the dimensions', () => {
    expect(() => splatFor(new Float32Array(4))).toThrow(/needs 1024 heights/);
  });

  it('produces one weight set per sample', () => {
    expect(splatFor(flat(0)).length).toBe(SIZE * SIZE * 4);
  });

  it('weights sum to ~255 at every sample', () => {
    const heights = generateBiomeBlendedHeightMap(
      SIZE,
      SIZE,
      SEED,
      new Vector2(0, 0),
      DEFAULT_CLIMATE
    );
    const splat = splatFor(heights);

    for (let i = 0; i < SIZE * SIZE; i++) {
      const sum =
        splat[i * 4] + splat[i * 4 + 1] + splat[i * 4 + 2] + splat[i * 4 + 3];
      // Each channel rounds independently, so the sum can drift by up to 2.
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic for the same seed, position and heights', () => {
    const heights = flat(10);
    expect(splatFor(heights)).toEqual(splatFor(heights));
  });

  // Climate is a pure function of world position, so the same world position
  // resolves the same whichever chunk asks — this is what keeps the splat
  // seamless across chunk borders, exactly as the heightfield is.
  it('agrees across a chunk border', () => {
    const span = SIZE - 1;
    const left = splatFor(flat(10), DEFAULT_CLIMATE, new Vector2(0, 0));
    const right = splatFor(flat(10), DEFAULT_CLIMATE, new Vector2(span, 0));

    for (let y = 0; y < SIZE; y++) {
      for (let c = 0; c < 4; c++) {
        // The left chunk's last column is the same world position as the right
        // chunk's first column.
        expect(at(right, 0, y, c)).toBe(at(left, SIZE - 1, y, c));
      }
    }
  });

  describe('layer selection', () => {
    it('gives a plain its only layer, whatever the terrain does', () => {
      for (const heights of [flat(5), flat(190)]) {
        const splat = splatFor(heights, PLAIN_ONLY);
        for (let i = 0; i < SIZE * SIZE; i++) {
          expect(splat[i * 4 + GRASS]).toBe(255);
        }
      }
    });

    it('surfaces flat low mountain ground as its base material', () => {
      const splat = splatFor(flat(5), MOUNTAIN_ONLY);
      for (let i = 0; i < SIZE * SIZE; i++) {
        expect(splat[i * 4 + BASE]).toBe(255);
        expect(splat[i * 4 + ROCK]).toBe(0);
        expect(splat[i * 4 + SNOW]).toBe(0);
      }
    });

    it('surfaces flat high mountain ground as snow', () => {
      const splat = splatFor(flat(190), MOUNTAIN_ONLY);
      for (let i = 0; i < SIZE * SIZE; i++) {
        expect(splat[i * 4 + SNOW]).toBe(255);
      }
    });

    it('surfaces steep mountain ground as rock rather than the base', () => {
      // A ramp climbing along x past the top of the rock band, so rock has
      // fully taken over from the base.
      const rise = Math.tan(CLIFF_SLOPE * DEG_TO_RAD);
      const heights = new Float32Array(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) heights[x + y * SIZE] = x * rise;

      const splat = splatFor(heights, MOUNTAIN_ONLY);

      // Interior only — edge samples use a one-sided gradient.
      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          expect(at(splat, x, y, ROCK)).toBe(255);
          expect(at(splat, x, y, BASE)).toBe(0);
        }
      }
    });

    // The reason snow carries an inverted slope band. A high cliff must show
    // the rock beneath rather than reading as dipped in white paint.
    it('leaves high cliffs as rock rather than snowing over them', () => {
      // Sheer enough that snow's slope band has let go entirely and rock has
      // fully taken over, and high enough that snow's height band would
      // otherwise cover it completely.
      const rise = Math.tan(CLIFF_SLOPE * DEG_TO_RAD);
      const heights = new Float32Array(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
          heights[x + y * SIZE] = SNOW_HEIGHT.to + 20 + x * rise;

      const splat = splatFor(heights, MOUNTAIN_ONLY);

      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          expect(at(splat, x, y, SNOW)).toBe(0);
          expect(at(splat, x, y, ROCK)).toBe(255);
        }
      }
    });

    it('blends rather than snapping across the snow line', () => {
      // Climbing the snow's height band needs a *gentle* ramp: rise steeply
      // enough to cross it in a few samples and the slope alone would keep snow
      // off, whatever the altitude. So the ramp sits inside snow's slope band
      // and the grid is sized to climb through the height band at that rate.
      const rise = Math.tan((SNOW_SLOPE.to - 10) * DEG_TO_RAD);
      const startHeight = SNOW_HEIGHT.from - 20;
      const wide = Math.ceil((SNOW_HEIGHT.to + 20 - startHeight) / rise) + 2;

      const heights = new Float32Array(wide * wide);
      for (let y = 0; y < wide; y++)
        for (let x = 0; x < wide; x++)
          heights[x + y * wide] = startHeight + y * rise;

      const splat = generateSplatMap(
        wide,
        wide,
        SEED,
        new Vector2(0, 0),
        MOUNTAIN_ONLY,
        heights
      );

      // Snow must rise monotonically up the slope, through intermediate values
      // rather than in a single 0→255 step.
      const column: number[] = [];
      for (let y = 1; y < wide - 1; y++)
        column.push(splat[(2 + y * wide) * 4 + SNOW]);

      for (let i = 1; i < column.length; i++) {
        expect(column[i]).toBeGreaterThanOrEqual(column[i - 1]);
      }
      expect(column[0]).toBe(0);
      expect(column[column.length - 1]).toBe(255);
      expect(column.filter((v) => v > 0 && v < 255).length).toBeGreaterThan(20);
    });
  });
});
