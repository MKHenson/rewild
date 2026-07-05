import { Vector2 } from 'rewild-common';
import { generateBiomeBlendedHeightMap } from './Noise';
import {
  BiomeParams,
  ClimateConfig,
  DEFAULT_CLIMATE,
  MOUNTAIN,
  PLAIN,
  getMaxWorldHeight,
} from './Biomes';

// Matches how TerrainRenderer/TerrainChunk lay out chunks: world position is
// coord * (mapChunkSize - 1), so adjacent chunks share an edge row/column.
const CHUNK_SIZE = 65;
const SEED = 12345;

function generate(
  offsetX: number,
  offsetY: number,
  seed = SEED,
  climate: ClimateConfig = DEFAULT_CLIMATE,
  width = CHUNK_SIZE,
  height = CHUNK_SIZE
) {
  return generateBiomeBlendedHeightMap(
    width,
    height,
    seed,
    new Vector2(offsetX, offsetY),
    climate
  );
}

// A biome whose height is a constant `heightScale` everywhere (pow(n, 0) === 1),
// so tests can isolate the climate blending from the octave noise.
function flatBiome(name: string, heightScale: number): BiomeParams {
  return {
    name,
    heightScale,
    noiseScale: 400,
    octaves: 1,
    persistence: 0.5,
    lacunarity: 2.0,
    heightCurveExp: 0,
  };
}

function singleBiomeClimate(biome: BiomeParams): ClimateConfig {
  return {
    temperature: { ...DEFAULT_CLIMATE.temperature, cuts: [] },
    moisture: { ...DEFAULT_CLIMATE.moisture, cuts: [] },
    biomes: [biome],
    cells: [[0]],
  };
}

describe('generateBiomeBlendedHeightMap', () => {
  it('is deterministic for the same seed and position', () => {
    const a = generate(100, -300);
    const b = generate(100, -300);
    expect(a).toEqual(b);
  });

  it('differs for a different seed', () => {
    const a = generate(0, 0, 1);
    const b = generate(0, 0, 2);
    expect(a).not.toEqual(b);
  });

  it('has no seams across x chunk borders', () => {
    const left = generate(0, 0);
    const right = generate(CHUNK_SIZE - 1, 0);

    for (let y = 0; y < CHUNK_SIZE; y++) {
      const leftEdge = left[y * CHUNK_SIZE + (CHUNK_SIZE - 1)];
      const rightEdge = right[y * CHUNK_SIZE];
      expect(rightEdge).toBeCloseTo(leftEdge, 4);
    }
  });

  it('has no seams across y chunk borders', () => {
    const a = generate(0, 0);
    const b = generate(0, CHUNK_SIZE - 1);

    // offset.y enters the noise negatively and mesh z is flipped, so the
    // neighbour at +y shares its last row with this chunk's first row.
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const aFirstRow = a[x];
      const bLastRow = b[(CHUNK_SIZE - 1) * CHUNK_SIZE + x];
      expect(bLastRow).toBeCloseTo(aFirstRow, 4);
    }
  });

  it('keeps plains markedly flatter than mountains', () => {
    // Single-biome climates so the comparison holds regardless of where the
    // climate maps put each biome.
    const plainOnly = generate(0, 0, SEED, singleBiomeClimate(PLAIN));
    const mountainOnly = generate(0, 0, SEED, singleBiomeClimate(MOUNTAIN));

    const range = (map: Float32Array) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < map.length; i++) {
        if (map[i] < min) min = map[i];
        if (map[i] > max) max = map[i];
      }
      return max - min;
    };

    expect(range(plainOnly)).toBeLessThan(range(mountainOnly));
  });

  it('stays within [0, heightScale] of the tallest biome', () => {
    const heights = generate(0, 0);
    const max = getMaxWorldHeight(DEFAULT_CLIMATE);
    for (let i = 0; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(0);
      expect(heights[i]).toBeLessThanOrEqual(max);
    }
  });

  it('blends heights inside the transition band (no cliffs at biome borders)', () => {
    // Flat biomes make any variation along the strip come purely from the
    // climate blend weights. 4097 world-units is wider than the axis scales,
    // so the strip crosses band borders.
    const climate: ClimateConfig = {
      temperature: DEFAULT_CLIMATE.temperature,
      moisture: DEFAULT_CLIMATE.moisture,
      biomes: [flatBiome('low', 0), flatBiome('high', 100)],
      cells: [[1], [0]],
    };
    const strip = generate(0, 0, SEED, climate, 4097, 1);

    let maxStep = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < strip.length; i++) {
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(strip[i] - strip[i - 1]));
      min = Math.min(min, strip[i]);
      max = Math.max(max, strip[i]);
    }

    // The strip must actually cross biome territory for the test to mean anything.
    expect(max - min).toBeGreaterThan(10);
    // One world-unit of travel should never jump more than a sliver of the
    // 100m biome height difference — a cliff at the border would show up here.
    expect(maxStep).toBeLessThan(5);
  });

  it('supports a full 2×2 temperature × moisture grid without cliffs', () => {
    const climate: ClimateConfig = {
      temperature: { scale: 1200, seedSalt: 7919, cuts: [0.5], blendHalfWidth: 0.05 },
      moisture: { scale: 900, seedSalt: 104729, cuts: [0.5], blendHalfWidth: 0.05 },
      biomes: [
        flatBiome('cold-dry', 0),
        flatBiome('cold-wet', 30),
        flatBiome('warm-dry', 60),
        flatBiome('warm-wet', 90),
      ],
      cells: [
        [0, 1],
        [2, 3],
      ],
    };

    // Smaller axis scales above force several borders (including both axes
    // blending at once) inside one patch.
    const size = 513;
    const patch = generate(0, 0, SEED, climate, size, size);

    let min = Infinity;
    let max = -Infinity;
    let maxStep = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const h = patch[y * size + x];
        min = Math.min(min, h);
        max = Math.max(max, h);
        if (x > 0) maxStep = Math.max(maxStep, Math.abs(h - patch[y * size + x - 1]));
        if (y > 0) maxStep = Math.max(maxStep, Math.abs(h - patch[(y - 1) * size + x]));
      }
    }

    // Multiple distinct biomes present…
    expect(max - min).toBeGreaterThan(30);
    // …and heights stay inside the table's range with no walls at any border.
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(90);
    expect(maxStep).toBeLessThan(7.5);
  });

  it('does not distort heights when all cells share one biome', () => {
    // With every cell pointing at the same biome, the climate machinery
    // (axis sampling, band resolution, weight merging) must be a no-op on the
    // output — identical to a climate with no cuts at all.
    const mountainOnly = generate(0, 0, SEED, singleBiomeClimate(MOUNTAIN));
    const blended = generate(0, 0, SEED, {
      ...DEFAULT_CLIMATE,
      biomes: [MOUNTAIN],
      cells: [[0], [0]],
    });
    expect(blended).toEqual(mountainOnly);
  });

  it('rejects a cells grid that does not match the axis bands', () => {
    const bad: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      cells: [[0]], // temperature has 2 bands, only 1 row given
    };
    expect(() => generate(0, 0, SEED, bad)).toThrow();
  });
});
