import { Perlin, Vector2 } from 'rewild-common';
import { ClimateConfig, Deformation } from './Biomes';
import { createClimateField, resolveBiomeWeights } from './ClimateField';

const DEG2RAD = Math.PI / 180;

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

// Per-deformation constants computed once per chunk (before the sample loop) and
// read-only inside it, so the loop itself allocates nothing. Which fields are
// live depends on the deformation's kind: fbm fills the octave arrays and
// maxAmplitude; dunes fill the orientation and warp offsets. The other kind's
// fields are inert.
interface PreparedDeformation {
  // fbm: per-octave sample offsets (random decorrelation + this chunk's world
  // offset folded in, so the field is continuous across chunk borders) and the
  // octave stack's theoretical max, for the same seam-free normalisation the
  // standalone generateNoiseMap uses.
  offsetsX: Float64Array | null;
  offsetsY: Float64Array | null;
  maxAmplitude: number;
  // dunes: wind bearing as a unit vector, and the warp field's own offset.
  cos: number;
  sin: number;
  warpOffsetX: number;
  warpOffsetY: number;
}

// Builds the per-chunk constants for one deformation. Fbm derives its octave
// offsets from seed + seedSalt using the same rng stream as generateNoiseMap, so
// two fbm deformations sharing a salt see the same field (and salt 0 reproduces
// the pre-deformation shared-offset behaviour exactly). The chunk's world offset
// is folded into every offset so neighbouring chunks stay seam-free.
function prepareDeformation(
  def: Deformation,
  seed: number,
  offset: Vector2
): PreparedDeformation {
  if (def.kind === 'fbm') {
    const rng = seededRandom(seed + def.seedSalt);
    const offsetsX = new Float64Array(def.octaves);
    const offsetsY = new Float64Array(def.octaves);
    for (let i = 0; i < def.octaves; i++) {
      offsetsX[i] = rng() * 200000 - 100000 + offset.x;
      offsetsY[i] = rng() * 200000 - 100000 + offset.y;
    }
    return {
      offsetsX,
      offsetsY,
      maxAmplitude: theoreticalMaxAmplitude(def.persistence, def.octaves),
      cos: 0,
      sin: 0,
      warpOffsetX: 0,
      warpOffsetY: 0,
    };
  }

  // dunes
  const rng = seededRandom(seed + def.seedSalt);
  const rad = def.angleDeg * DEG2RAD;
  return {
    offsetsX: null,
    offsetsY: null,
    maxAmplitude: 1,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
    warpOffsetX: rng() * 200000 - 100000,
    warpOffsetY: rng() * 200000 - 100000,
  };
}

// One deformation's height contribution in meters at one sample. A plain switch
// on `kind` — no allocation, no dynamic dispatch — so the whole heightfield loop
// stays cheap however many kinds exist. `offsetX/Y` are this chunk's world
// offset; fbm has them folded into its octave offsets already and ignores them,
// dunes need them for the continuous along-wind coordinate.
function evalDeformation(
  perlin: Perlin,
  def: Deformation,
  prep: PreparedDeformation,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  offsetX: number,
  offsetY: number
): number {
  switch (def.kind) {
    case 'fbm': {
      const offsetsX = prep.offsetsX!;
      const offsetsY = prep.offsetsY!;
      let amplitude = 1;
      let frequency = 1;
      let noiseValue = 0;

      for (let o = 0; o < def.octaves; o++) {
        const sampleX = ((x - halfWidth + offsetsX[o]) / def.noiseScale) * frequency;
        const sampleY = ((y - halfHeight - offsetsY[o]) / def.noiseScale) * frequency;

        noiseValue += perlin.simplex2(sampleX, sampleY) * amplitude;

        amplitude *= def.persistence;
        frequency *= def.lacunarity;
      }

      let n = (noiseValue / prep.maxAmplitude + 1) * 0.5;
      if (n < 0) n = 0;
      else if (n > 1) n = 1;

      return Math.pow(n, def.curveExp) * def.amplitude;
    }

    case 'dunes': {
      // World position, same continuous basis as the fbm field so dunes are
      // seam-free too: +x folds in +offsetX, +y in −offsetY (the height noise's
      // sign convention — see generateBiomeBlendedHeightMap's seam tests).
      const wx = x - halfWidth + offsetX;
      const wy = y - halfHeight - offsetY;

      // Meander the crest lines: a low-frequency simplex value in [-1,1] that
      // bends the otherwise-straight ridges into drifting waves.
      const warpN = perlin.simplex2(
        (wx + prep.warpOffsetX) / def.warpScale,
        (wy + prep.warpOffsetY) / def.warpScale
      );

      // Distance along the wind bearing, in wavelengths, meandered — so crests
      // (lines of constant phase) run across the wind at ~wavelength spacing.
      const along = wx * prep.cos + wy * prep.sin;
      const phase = along / def.wavelength + def.warp * warpN;

      // One dune period as a skewed profile: gentle windward rise to a crest at
      // fraction p, then a shorter, steeper leeward drop. sharpness pushes the
      // crest toward the lee (p→1), which is the slip face steepening.
      const u = phase - Math.floor(phase); // 0..1 within the period
      const p = 0.5 + 0.45 * def.sharpness;
      const tri = u < p ? u / p : (1 - u) / (1 - p);
      const wave = tri * tri * (3 - 2 * tri); // smoothstep: soft swell, defined crest

      return def.amplitude * wave;
    }
  }
}

// Summed height for one biome at one sample: its deformation stack evaluated
// base-first and added. Seam-free and allocation-free (see evalDeformation).
function biomeHeight(
  perlin: Perlin,
  deformations: Deformation[],
  prepared: PreparedDeformation[],
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  offsetX: number,
  offsetY: number
): number {
  let h = 0;
  for (let d = 0; d < deformations.length; d++) {
    h += evalDeformation(
      perlin,
      deformations[d],
      prepared[d],
      x,
      y,
      halfWidth,
      halfHeight,
      offsetX,
      offsetY
    );
  }
  return h;
}

function validateClimate(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    if (!biome.deformations || biome.deformations.length === 0)
      throw new Error(`Biome '${biome.name}' must have at least one deformation.`);
    for (const def of biome.deformations) {
      if (def.kind === 'fbm' && def.noiseScale <= 0)
        throw new Error(
          `Biome '${biome.name}' fbm deformation noiseScale must be a positive number.`
        );
      if (def.kind === 'dunes' && (def.wavelength <= 0 || def.warpScale <= 0))
        throw new Error(
          `Biome '${biome.name}' dune deformation wavelength and warpScale must be positive numbers.`
        );
    }
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

  // Precompute each biome's per-deformation constants (octave offsets and
  // normalisation for fbm, orientation and warp offset for dunes) once, before
  // the sample loop, so the loop reads them and allocates nothing. Fbm bases
  // sharing seedSalt 0 all derive the same offsets, which keeps neighbouring
  // biomes' large-scale relief aligned across transition bands — what the old
  // single shared-offset stream did, now expressed per field.
  const prepared: PreparedDeformation[][] = new Array(biomes.length);
  for (let b = 0; b < biomes.length; b++) {
    const defs = biomes[b].deformations;
    const row: PreparedDeformation[] = new Array(defs.length);
    for (let d = 0; d < defs.length; d++)
      row[d] = prepareDeformation(defs[d], seed, offset);
    prepared[b] = row;
  }

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
            biomes[biomeIndex].deformations,
            prepared[biomeIndex],
            x,
            y,
            halfWidth,
            halfHeight,
            offset.x,
            offset.y
          );
      }

      heights[x + y * width] = h;
    }
  }

  return heights;
}
