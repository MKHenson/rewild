import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  DEFAULT_CLIMATE,
  DESERT,
  MOUNTAIN,
  PLAIN,
  SPLAT_BYTES_PER_TEXEL,
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
const LEAVES = channelOf(PLAIN.layers[1].material); // noise-mixed with GRASS
const BASE = channelOf(MOUNTAIN.layers[0].material); // mountain's base ground
const ROCK = channelOf(MOUNTAIN.layers[1].material); // slope layer
const SNOW = channelOf(MOUNTAIN.layers[2].material); // height layer
const SAND = channelOf(DESERT.layers[0].material);
const PAN = channelOf(DESERT.layers[1].material); // low + flat layer

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
    // The full biome list, so the palette — and therefore every channel index
    // below — matches DEFAULT_CLIMATE's even though only one cell is reachable.
    biomes: [PLAIN, MOUNTAIN, DESERT],
    cells: [[biomeIndex]],
  };
}

const MOUNTAIN_ONLY = climateOfOneBiome(1);
const PLAIN_ONLY = climateOfOneBiome(0);
const DESERT_ONLY = climateOfOneBiome(2);

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

// Weight of palette channel `c` at texel `index`, as a 0..255 byte. The splat
// is two RGBA8 planes back to back, so channels 0-3 come from the first and
// 4-7 from the second at the same texel — never assume one flat stride.
function channelAt(
  splat: Uint8Array,
  index: number,
  c: number,
  texels = SIZE * SIZE
): number {
  const planeStride = texels * 4;
  return splat[Math.floor(c / 4) * planeStride + index * 4 + (c % 4)];
}

// Weight of channel `c` at sample (x, y), as a 0..255 byte.
function at(splat: Uint8Array, x: number, y: number, c: number): number {
  return channelAt(splat, x + y * SIZE, c);
}

describe('generateSplatMap', () => {
  it('rejects a heightfield that does not match the dimensions', () => {
    expect(() => splatFor(new Float32Array(4))).toThrow(/needs 1024 heights/);
  });

  it('produces one weight set per sample', () => {
    expect(splatFor(flat(0)).length).toBe(SIZE * SIZE * SPLAT_BYTES_PER_TEXEL);
  });

  it('weights sum to ~255 at every sample, across both planes', () => {
    const heights = generateBiomeBlendedHeightMap(
      SIZE,
      SIZE,
      SEED,
      new Vector2(0, 0),
      DEFAULT_CLIMATE
    );
    const splat = splatFor(heights);

    for (let i = 0; i < SIZE * SIZE; i++) {
      let sum = 0;
      for (let c = 0; c < SPLAT_BYTES_PER_TEXEL; c++)
        sum += channelAt(splat, i, c);
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
      for (let c = 0; c < SPLAT_BYTES_PER_TEXEL; c++) {
        // The left chunk's last column is the same world position as the right
        // chunk's first column.
        expect(at(right, 0, y, c)).toBe(at(left, SIZE - 1, y, c));
      }
    }
  });
});
