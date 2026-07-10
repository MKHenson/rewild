import { Perlin, Vector2 } from 'rewild-common';
import { BiomeParams, ClimateAxis, ClimateConfig } from './Biomes';

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

// Which band an axis value falls in, plus the smoothstep blend into the next
// band when the value sits inside a cut's transition zone. bandB === bandA
// (with weight 0) outside transition zones.
interface ResolvedAxis {
  bandA: number;
  bandB: number;
  weight: number;
}

function resolveAxis(value: number, axis: ClimateAxis, out: ResolvedAxis): void {
  const cuts = axis.cuts;
  const half = axis.blendHalfWidth;

  let band = 0;
  while (band < cuts.length && value >= cuts[band]) band++;

  out.bandA = band;
  out.bandB = band;
  out.weight = 0;

  // Blending into the band above (value just below cuts[band])?
  if (band < cuts.length && value > cuts[band] - half) {
    const t = (value - (cuts[band] - half)) / (2 * half);
    out.bandB = band + 1;
    out.weight = t * t * (3 - 2 * t);
  }
  // Blending out of the band below (value just above cuts[band-1])?
  else if (band > 0 && value < cuts[band - 1] + half) {
    const t = (value - (cuts[band - 1] - half)) / (2 * half);
    out.bandA = band - 1;
    out.weight = t * t * (3 - 2 * t);
  }
}

// Merge a (biome, weight) pair into the active-cell scratch arrays, returning
// the new active count. This is deliberately a top-level function taking the
// count as a parameter rather than a closure over a mutable `activeCount`:
// V8's Maglev optimizer (Chrome ~149) miscompiles that closure when it
// OSR-compiles the sample loop mid-run, silently dropping every cell — the
// first heightmap a worker generates then collapses to zeros partway through.
// See issue notes: reproduced deterministically; a plain function is immune.
function addCell(
  activeBiomes: Int32Array,
  activeWeights: Float64Array,
  activeCount: number,
  biomeIndex: number,
  weight: number
): number {
  if (weight === 0) return activeCount;
  for (let i = 0; i < activeCount; i++) {
    if (activeBiomes[i] === biomeIndex) {
      activeWeights[i] += weight;
      return activeCount;
    }
  }
  activeBiomes[activeCount] = biomeIndex;
  activeWeights[activeCount] = weight;
  return activeCount + 1;
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
  const cells = climate.cells;
  const heights = new Float32Array(width * height);

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

  // Per-axis world offsets, salted so each axis is independent of the height
  // noise and of the other axis while staying seed-deterministic. Offsets carry
  // the chunk position with the same sign convention as the height noise, so
  // climate values are world-continuous across chunk borders.
  const tAxis = climate.temperature;
  const mAxis = climate.moisture;
  const tRng = seededRandom(seed + tAxis.seedSalt);
  const tOffsetX = tRng() * 200000 - 100000 + offset.x;
  const tOffsetY = tRng() * 200000 - 100000 + offset.y;
  const mRng = seededRandom(seed + mAxis.seedSalt);
  const mOffsetX = mRng() * 200000 - 100000 + offset.x;
  const mOffsetY = mRng() * 200000 - 100000 + offset.y;

  // An axis with no cuts has a single band — skip its noise entirely.
  const sampleTemperature = tAxis.cuts.length > 0;
  const sampleMoisture = mAxis.cuts.length > 0;

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Scratch state reused across samples (no allocation in the sample loop).
  const t: ResolvedAxis = { bandA: 0, bandB: 0, weight: 0 };
  const m: ResolvedAxis = { bandA: 0, bandB: 0, weight: 0 };
  const activeBiomes = new Int32Array(4);
  const activeWeights = new Float64Array(4);
  let activeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (sampleTemperature) {
        const tValue =
          (perlin.simplex2(
            (x - halfWidth + tOffsetX) / tAxis.scale,
            (y - halfHeight - tOffsetY) / tAxis.scale
          ) +
            1) *
          0.5;
        resolveAxis(tValue, tAxis, t);
      }
      if (sampleMoisture) {
        const mValue =
          (perlin.simplex2(
            (x - halfWidth + mOffsetX) / mAxis.scale,
            (y - halfHeight - mOffsetY) / mAxis.scale
          ) +
            1) *
          0.5;
        resolveAxis(mValue, mAxis, m);
      }

      // Bilinear weights over the (up to four) neighbouring cells; cells that
      // share a biome merge, so each biome is evaluated at most once.
      activeCount = addCell(
        activeBiomes,
        activeWeights,
        0,
        cells[t.bandA][m.bandA],
        (1 - t.weight) * (1 - m.weight)
      );
      if (m.bandB !== m.bandA)
        activeCount = addCell(
          activeBiomes,
          activeWeights,
          activeCount,
          cells[t.bandA][m.bandB],
          (1 - t.weight) * m.weight
        );
      if (t.bandB !== t.bandA) {
        activeCount = addCell(
          activeBiomes,
          activeWeights,
          activeCount,
          cells[t.bandB][m.bandA],
          t.weight * (1 - m.weight)
        );
        if (m.bandB !== m.bandA)
          activeCount = addCell(
            activeBiomes,
            activeWeights,
            activeCount,
            cells[t.bandB][m.bandB],
            t.weight * m.weight
          );
      }

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
