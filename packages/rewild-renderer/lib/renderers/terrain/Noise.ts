import { Perlin, Vector2 } from 'rewild-common';
import { BiomeParams, ClimateConfig } from './Biomes';
import { createClimateField, resolveBiomeWeights } from './ClimateField';

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function generateNoiseMap(
  width: number,
  height: number,
  scale: number,
  seed: number = 100,
  octaves: number = 4,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  offset: Vector2 = new Vector2(0, 0)
): Float32Array {
  const perlin = new Perlin(seed);
  const noiseMap = new Float32Array(width * height);

  if (octaves < 1) octaves = 1;
  if (persistence < 0) persistence = 0;
  if (lacunarity < 1) lacunarity = 1;
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive integers.');
  if (scale <= 0) throw new Error('Scale must be a positive number.');

  const rng = seededRandom(seed);

  const octaveOffsets: Vector2[] = new Array(octaves);
  for (let i = 0; i < octaves; i++) {
    const offsetX = rng() * 200000 - 100000 + offset.x;
    const offsetY = rng() * 200000 - 100000 + offset.y;
    octaveOffsets[i] = new Vector2(offsetX, offsetY);
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;

      for (let o = 0; o < octaves; o++) {
        const sampleX = ((x - halfWidth + octaveOffsets[o].x) / scale) * frequency;
        const sampleY = ((y - halfHeight - octaveOffsets[o].y) / scale) * frequency;

        noiseValue += perlin.simplex2(sampleX, sampleY) * amplitude;

        amplitude *= persistence;
        frequency *= lacunarity;
      }

      noiseMap[x + y * width] = noiseValue;
    }
  }

  // Normalize to [0,1] using the theoretical max amplitude for this octave/persistence
  // combination. Because this is a fixed constant (not per-chunk min/max), normalization
  // is continuous across chunk boundaries — no seams.
  const maxAmplitude = theoreticalMaxAmplitude(persistence, octaves);
  for (let i = 0; i < noiseMap.length; i++) {
    noiseMap[i] = (noiseMap[i] / maxAmplitude + 1) * 0.5;
  }

  return noiseMap;
}

function theoreticalMaxAmplitude(persistence: number, octaves: number): number {
  if (persistence === 1) return octaves;
  return (1 - Math.pow(persistence, octaves)) / (1 - persistence);
}

// Octave-summed height for one biome at one sample, normalised to [0,1] with the
// biome's own fixed max amplitude (seam-free, see generateNoiseMap), curved by
// heightCurveExp and scaled to meters.
function biomeHeight(
  perlin: Perlin,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  octaveOffsetsX: Float64Array,
  octaveOffsetsY: Float64Array,
  biome: BiomeParams,
  maxAmplitude: number
): number {
  let amplitude = 1;
  let frequency = 1;
  let noiseValue = 0;

  for (let o = 0; o < biome.octaves; o++) {
    const sampleX = ((x - halfWidth + octaveOffsetsX[o]) / biome.noiseScale) * frequency;
    const sampleY = ((y - halfHeight - octaveOffsetsY[o]) / biome.noiseScale) * frequency;

    noiseValue += perlin.simplex2(sampleX, sampleY) * amplitude;

    amplitude *= biome.persistence;
    frequency *= biome.lacunarity;
  }

  let n = (noiseValue / maxAmplitude + 1) * 0.5;
  if (n < 0) n = 0;
  else if (n > 1) n = 1;

  return Math.pow(n, biome.heightCurveExp) * biome.heightScale;
}

function validateClimate(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    if (biome.noiseScale <= 0)
      throw new Error(`Biome '${biome.name}' noiseScale must be a positive number.`);
  }
  const tBands = climate.temperature.cuts.length + 1;
  const mBands = climate.moisture.cuts.length + 1;
  if (climate.cells.length !== tBands)
    throw new Error(`Climate cells must have ${tBands} temperature rows.`);
  for (const row of climate.cells) {
    if (row.length !== mBands)
      throw new Error(`Climate cell rows must have ${mBands} moisture entries.`);
    for (const biomeIndex of row) {
      if (biomeIndex < 0 || biomeIndex >= climate.biomes.length)
        throw new Error(`Climate cell biome index ${biomeIndex} is out of range.`);
    }
  }
}

/**
 * Generates a heightmap in absolute world meters, with the biome at each
 * sample selected by a temperature × moisture climate model.
 *
 * Each climate axis is a separate, much lower-frequency noise field (seeded
 * from the world seed with a per-axis salt) split into bands; the
 * (temperature band, moisture band) cell picks a biome from the table. Around
 * a band cut the two neighbouring cells' *heights* are smoothstep-lerped (not
 * their params), bilinearly when both axes are in a transition at once — so at
 * most four biome evaluations per sample, and exactly one away from borders:
 * generation cost outside transition bands matches single-biome generation.
 */
export function generateBiomeBlendedHeightMap(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig
): Float32Array {
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive integers.');
  validateClimate(climate);

  const perlin = new Perlin(seed);
  const biomes = climate.biomes;
  const heights = new Float32Array(width * height);

  // Climate resolution is shared with splat generation so the materials a chunk
  // is surfaced with always agree with the biome that shaped it.
  const field = createClimateField(width, height, seed, offset, climate);

  // All biomes share one set of octave offsets (same rng stream as
  // generateNoiseMap) so they sample the same underlying fields and blended
  // features stay spatially aligned across transition bands.
  let maxOctaves = 1;
  for (const biome of biomes) maxOctaves = Math.max(maxOctaves, biome.octaves);
  const rng = seededRandom(seed);
  const octaveOffsetsX = new Float64Array(maxOctaves);
  const octaveOffsetsY = new Float64Array(maxOctaves);
  for (let i = 0; i < maxOctaves; i++) {
    octaveOffsetsX[i] = rng() * 200000 - 100000 + offset.x;
    octaveOffsetsY[i] = rng() * 200000 - 100000 + offset.y;
  }

  const maxAmplitudes = new Float64Array(biomes.length);
  for (let i = 0; i < biomes.length; i++)
    maxAmplitudes[i] = theoreticalMaxAmplitude(biomes[i].persistence, biomes[i].octaves);

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Scratch state reused across samples (no allocation in the sample loop).
  const activeBiomes = new Int32Array(4);
  const activeWeights = new Float64Array(4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Bilinear weights over the (up to four) neighbouring climate cells;
      // cells that share a biome merge, so each biome is evaluated at most once.
      const activeCount = resolveBiomeWeights(
        field,
        x,
        y,
        activeBiomes,
        activeWeights
      );

      let h = 0;
      for (let i = 0; i < activeCount; i++) {
        const biomeIndex = activeBiomes[i];
        h +=
          activeWeights[i] *
          biomeHeight(
            perlin,
            x,
            y,
            halfWidth,
            halfHeight,
            octaveOffsetsX,
            octaveOffsetsY,
            biomes[biomeIndex],
            maxAmplitudes[biomeIndex]
          );
      }

      heights[x + y * width] = h;
    }
  }

  return heights;
}
