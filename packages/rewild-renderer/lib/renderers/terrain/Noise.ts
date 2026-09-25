import { Perlin, Vector2 } from 'rewild-common';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { ClimateConfig, Deformation } from './Biomes';
import {
  continentLandWeight,
  continentSeabedDepth,
  createClimateField,
  resolveBiomeWeights,
  sampleContinent,
} from './ClimateField';

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

// How far a ridged octave lets the one below it through, at full strength.
const RIDGE_GAIN = 2;

/**
 * Passes of thermal erosion a biome may ask for.
 *
 * Every pass widens the margin the height map generates around itself, and the
 * margin costs `(size + 2n)^2` samples, so this is a ceiling on what one
 * config can spend on behalf of every caller.
 */
export const MAX_EROSION_ITERATIONS = 48;

/**
 * Magnitude a 2D simplex gradient typically reaches, measured over the field.
 * The eroded kind divides its accumulated slope by the largest that slope
 * could be, the way the value is divided by `maxAmplitude`, so that `erosion`
 * means the same strength whatever the octave count, persistence and
 * lacunarity are. Without it the raw slope runs to a median of 29 on the
 * mountain's settings, and `erosion: 1` damps by a factor of thirty.
 */
const GRAD_TYPICAL = 2.6;

// Scratch for the eroded kind's gradient. Module scope because the sample loop
// must not allocate, and the evaluator is never re-entered.
const GRAD = new Float64Array(2);

// Narrowest a terrace riser may be, as a fraction of a bench either side of its
// middle. A riser of no width is a vertical wall, which the mesh cannot carry
// and the normals cannot shade.
const RISER_MIN = 0.02;

function smoothstepBetween(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
  // Slope the octave sum would reach with every octave's gradient aligned and
  // at full magnitude. The eroded kind's normaliser; 0 for every other kind.
  maxSlope: number;
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
  // fbm, ridged and terrace are all octave sums over the same basis, so they
  // share one preparation: per-octave offsets and the amplitude the sum can
  // reach.
  if (
    def.kind === 'fbm' ||
    def.kind === 'ridged' ||
    def.kind === 'terrace' ||
    def.kind === 'eroded'
  ) {
    const rng = seededRandom(seed + def.seedSalt);
    const offsetsX = new Float64Array(def.octaves);
    const offsetsY = new Float64Array(def.octaves);
    for (let i = 0; i < def.octaves; i++) {
      offsetsX[i] = rng() * 200000 - 100000 + offset.x;
      offsetsY[i] = rng() * 200000 - 100000 + offset.y;
    }
    // Sum of amplitude x frequency over the octaves: amplitude falls as
    // frequency rises, so each octave's share of the slope stays near one and
    // the total grows with the octave count rather than with the lacunarity.
    let maxSlope = 0;
    if (def.kind === 'eroded') {
      let amplitude = 1;
      let frequency = 1;
      for (let i = 0; i < def.octaves; i++) {
        maxSlope += amplitude * frequency;
        amplitude *= def.persistence;
        frequency *= def.lacunarity;
      }
      maxSlope *= GRAD_TYPICAL;
    }

    return {
      offsetsX,
      offsetsY,
      maxAmplitude: theoreticalMaxAmplitude(def.persistence, def.octaves),
      cos: 0,
      sin: 0,
      warpOffsetX: 0,
      warpOffsetY: 0,
      maxSlope,
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
    maxSlope: 0,
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

    case 'ridged': {
      const offsetsX = prep.offsetsX!;
      const offsetsY = prep.offsetsY!;
      let amplitude = 1;
      let frequency = 1;
      let sum = 0;
      // Carried between octaves: the octave above decides how much of the one
      // below survives, so detail gathers on the ridges and the flanks stay
      // smooth. Starts at 1 so the first octave is unweighted.
      let weight = 1;

      for (let o = 0; o < def.octaves; o++) {
        const sampleX = ((x - halfWidth + offsetsX[o]) / def.noiseScale) * frequency;
        const sampleY = ((y - halfHeight - offsetsY[o]) / def.noiseScale) * frequency;

        // 1 where the noise crosses zero, 0 at its extremes: the ridge is the
        // crossing, not the peak.
        let r = 1 - Math.abs(perlin.simplex2(sampleX, sampleY));
        r = Math.pow(r, def.sharpness);
        r *= weight;

        // Never above 1, or the gain compounds octave on octave and the field
        // runs away from the amplitude it was normalised against.
        weight = Math.min(1, r * RIDGE_GAIN);
        sum += r * amplitude;

        amplitude *= def.persistence;
        frequency *= def.lacunarity;
      }

      // Every octave is already 0..1, so the sum needs no recentring.
      let n = sum / prep.maxAmplitude;
      if (n < 0) n = 0;
      else if (n > 1) n = 1;

      return Math.pow(n, def.curveExp) * def.amplitude;
    }

    case 'terrace': {
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
      n = Math.pow(n, def.curveExp);

      // Split the height into benches, then reshape the fraction within one
      // bench: flat across most of it, with the climb squeezed into a riser
      // whose width falls as sharpness rises. At sharpness 0 the riser is the
      // whole bench, which is the unquantised ramp.
      const t = n * def.steps;
      const bench = Math.floor(t);
      const within = t - bench;
      const half = Math.max(RISER_MIN, (1 - def.sharpness) * 0.5);
      const climbed = smoothstepBetween(0.5 - half, 0.5 + half, within);

      return ((bench + climbed) / def.steps) * def.amplitude;
    }

    case 'eroded': {
      const offsetsX = prep.offsetsX!;
      const offsetsY = prep.offsetsY!;
      let amplitude = 1;
      let frequency = 1;
      let sum = 0;
      // The gradient of everything summed so far. Each octave contributes its
      // own scaled by amplitude times frequency, which is the octave's share of
      // the real surface slope: amplitude falls as frequency rises, so the
      // product stays near 1 and the sum is a slope rather than a number that
      // runs away with the octave count. Scaling by frequency alone reaches 119
      // by the sixth octave here, which damps everything past the second to
      // nothing and leaves the field smoother than the fbm it replaced.
      let dx = 0;
      let dy = 0;

      for (let o = 0; o < def.octaves; o++) {
        const sampleX = ((x - halfWidth + offsetsX[o]) / def.noiseScale) * frequency;
        const sampleY = ((y - halfHeight - offsetsY[o]) / def.noiseScale) * frequency;

        const value = perlin.simplex2d(sampleX, sampleY, GRAD);

        // Steep ground keeps less of what falls on it. Squared slope rather
        // than slope, so a flank sheds detail sharply once it tips over and
        // flat ground is left alone.
        const slopeX = dx / prep.maxSlope;
        const slopeY = dy / prep.maxSlope;
        const damp = 1 / (1 + def.erosion * (slopeX * slopeX + slopeY * slopeY));

        sum += value * amplitude * damp;
        dx += GRAD[0] * amplitude * frequency * damp;
        dy += GRAD[1] * amplitude * frequency * damp;

        amplitude *= def.persistence;
        frequency *= def.lacunarity;
      }

      let n = (sum / prep.maxAmplitude + 1) * 0.5;
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
      if (
        (def.kind === 'fbm' ||
          def.kind === 'ridged' ||
          def.kind === 'terrace' ||
          def.kind === 'eroded') &&
        def.noiseScale <= 0
      )
        throw new Error(
          `Biome '${biome.name}' ${def.kind} deformation noiseScale must be a positive number.`
        );
      if (def.kind === 'ridged' && def.sharpness <= 0)
        throw new Error(
          `Biome '${biome.name}' ridged deformation sharpness must be a positive number.`
        );
      if (def.kind === 'terrace' && def.steps < 1)
        throw new Error(`Biome '${biome.name}' terrace deformation needs at least one step.`);
      if (def.kind === 'eroded' && def.erosion < 0)
        throw new Error(
          `Biome '${biome.name}' eroded deformation erosion must not be negative.`
        );
      if (def.kind === 'dunes' && (def.wavelength <= 0 || def.warpScale <= 0))
        throw new Error(
          `Biome '${biome.name}' dune deformation wavelength and warpScale must be positive numbers.`
        );
    }

    const e = biome.erosion;
    if (e) {
      if (e.iterations < 0 || e.iterations > MAX_EROSION_ITERATIONS)
        throw new Error(
          `Biome '${biome.name}' erosion iterations must be 0..${MAX_EROSION_ITERATIONS}. ` +
            'Every pass widens the margin the height map generates for itself.'
        );
      if (e.talusDeg <= 0 || e.talusDeg >= 90)
        throw new Error(`Biome '${biome.name}' erosion talusDeg must be between 0 and 90.`);
      if (e.strength <= 0 || e.strength > 1)
        throw new Error(`Biome '${biome.name}' erosion strength must be above 0 and at most 1.`);
    }
  }
  const continent = climate.continent;
  if (continent) {
    if (continent.scale <= 0)
      throw new Error('Continent scale must be a positive number.');
    if (
      continent.blendHalfWidth <= 0 ||
      continent.shelfWidth <= 0 ||
      continent.slopeWidth <= 0
    )
      throw new Error('Continent blend, shelf and slope widths must be positive numbers.');
    if (continent.shelfDepth < 0 || continent.oceanDepth < continent.shelfDepth)
      throw new Error('Continent depths must satisfy 0 <= shelfDepth <= oceanDepth.');
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
/**
 * Thermal erosion in place: material above the angle of repose slides to the
 * lower of its four neighbours until the slope between them is under it.
 *
 * Talus and strength come in per cell, blended from the biomes the cell sits
 * between, so an unweathered biome beside a weathered one does not pick up its
 * neighbour's scree.
 *
 * Deltas are gathered into a second buffer and applied at the end of each pass,
 * so a cell's move cannot depend on whether its neighbour has already moved.
 * The alternative reads as material flowing in whichever direction the loop
 * happens to run.
 *
 * Each pass moves material at most one sample, so after `passes` passes the
 * outermost `passes` cells of the field are the only ones that saw a truncated
 * neighbourhood. The caller generates that much margin and throws it away.
 */
function erodeThermal(
  heights: Float32Array,
  width: number,
  height: number,
  passes: number,
  talusHeight: Float32Array,
  strength: Float32Array
): void {
  const delta = new Float32Array(heights.length);

  for (let pass = 0; pass < passes; pass++) {
    delta.fill(0);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const c = x + y * width;
        const s = strength[c];
        if (s <= 0) continue;

        const h = heights[c];
        const threshold = talusHeight[c];

        // Excess over the angle of repose toward each downhill neighbour.
        const dL = h - heights[c - 1] - threshold;
        const dR = h - heights[c + 1] - threshold;
        const dU = h - heights[c - width] - threshold;
        const dD = h - heights[c + width] - threshold;

        let total = 0;
        let steepest = 0;
        if (dL > 0) {
          total += dL;
          if (dL > steepest) steepest = dL;
        }
        if (dR > 0) {
          total += dR;
          if (dR > steepest) steepest = dR;
        }
        if (dU > 0) {
          total += dU;
          if (dU > steepest) steepest = dU;
        }
        if (dD > 0) {
          total += dD;
          if (dD > steepest) steepest = dD;
        }
        if (total <= 0) continue;

        // Budgeted on the steepest neighbour and halved, which is what keeps a
        // pair of cells from trading the same material back and forth forever.
        const move = s * 0.5 * steepest;
        const share = move / total;

        if (dL > 0) delta[c - 1] += dL * share;
        if (dR > 0) delta[c + 1] += dR * share;
        if (dU > 0) delta[c - width] += dU * share;
        if (dD > 0) delta[c + width] += dD * share;
        delta[c] -= move;
      }
    }

    for (let i = 0; i < heights.length; i++) heights[i] += delta[i];
  }
}

/**
 * The widest margin any biome's erosion needs, in samples.
 *
 * One more than the pass count. A pass moves material one sample, so `passes`
 * alone looks sufficient, but the outermost ring is skipped by the pass (it has
 * no neighbour on one side) and so never moves when it should. That makes the
 * ring inside it wrong after the first pass, and the error walks inward one
 * ring per pass from there. The extra sample is what takes two neighbouring
 * chunks from agreeing to four decimal places to agreeing exactly.
 */
function erosionMargin(climate: ClimateConfig): number {
  let margin = 0;
  for (const biome of climate.biomes)
    if (biome.erosion && biome.erosion.strength > 0)
      margin = Math.max(margin, Math.ceil(biome.erosion.iterations) + 1);
  return margin;
}

export function generateBiomeBlendedHeightMap(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number = 0
): Float32Array {
  if (width <= 0 || height <= 0) throw new Error('Width and height must be positive integers.');
  validateClimate(climate);

  const perlin = new Perlin(seed);
  const biomes = climate.biomes;

  // Thermal erosion has to see past the edge of what it returns, because a pass
  // moves material one sample and the outermost cells would otherwise slide
  // against nothing. So the field is grown by the pass count, eroded, and
  // trimmed back. Growing it here rather than asking the caller for a wider
  // apron is what keeps every caller, and every chunk boundary, unaware: the
  // margin is derived from world position like everything else, so two
  // neighbouring chunks compute the same material for the ground they share.
  const margin = erosionMargin(climate);
  const fieldWidth = width + margin * 2;
  const fieldHeight = height + margin * 2;
  const heights = new Float32Array(fieldWidth * fieldHeight);

  // Climate resolution is shared with splat generation so the materials a chunk
  // is surfaced with always agree with the biome that shaped it. Both centre on
  // half their own size, so a grown field puts its inner region on exactly the
  // world positions the ungrown one would have.
  const field = createClimateField(fieldWidth, fieldHeight, seed, offset, climate);

  // Per-cell weathering, blended off the same weights the height is, so a biome
  // that asks for none never picks up its neighbour's scree.
  const talusHeight = margin > 0 ? new Float32Array(heights.length) : null;
  const erodeStrength = margin > 0 ? new Float32Array(heights.length) : null;

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

  const halfWidth = fieldWidth / 2;
  const halfHeight = fieldHeight / 2;

  const continent = climate.continent;

  // Scratch state reused across samples (no allocation in the sample loop).
  const activeBiomes = new Int32Array(4);
  const activeWeights = new Float64Array(4);

  for (let y = 0; y < fieldHeight; y++) {
    for (let x = 0; x < fieldWidth; x++) {
      // Bilinear weights over the (up to four) neighbouring climate cells;
      // cells that share a biome merge, so each biome is evaluated at most once.
      const activeCount = resolveBiomeWeights(
        field,
        x,
        y,
        activeBiomes,
        activeWeights
      );

      // Open ocean has no land height to blend, so its biomes are never
      // evaluated.
      let land = 1;
      let seabed = 0;
      if (continent) {
        const c = sampleContinent(field, x, y);
        land = continentLandWeight(continent, c);
        seabed = seaLevel - continentSeabedDepth(continent, c);
      }

      let h = 0;
      let talus = 0;
      let strength = 0;
      // Weight of the biomes at this cell that weather at all. The repose
      // angle is averaged over these and not over every biome present, or a
      // cell half in an unweathered biome would read as twice as steep a
      // repose and never slide.
      let erosionWeight = 0;
      for (let i = 0; i < activeCount && land > 0; i++) {
        const biomeIndex = activeBiomes[i];
        const weight = activeWeights[i];
        h +=
          weight *
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

        if (talusHeight) {
          const e = biomes[biomeIndex].erosion;
          if (e) {
            // The repose angle as a height difference between neighbouring
            // samples, which is the form the pass compares against.
            talus += weight * Math.tan(e.talusDeg * DEG2RAD) * TERRAIN_METERS_PER_SAMPLE;
            strength += weight * e.strength;
            erosionWeight += weight;
          }
        }
      }

      const cell = x + y * fieldWidth;
      heights[cell] = seabed + land * (h - seabed);
      if (talusHeight && erodeStrength) {
        // A cell blended between a weathered biome and an unweathered one has
        // a share of the strength, but the repose angle of the weathered ones
        // alone: averaging the angle against a zero would make it steeper the
        // less of it there is.
        talusHeight[cell] = erosionWeight > 0 ? talus / erosionWeight : 0;
        erodeStrength[cell] = strength;
      }
    }
  }

  if (margin > 0 && talusHeight && erodeStrength) {
    erodeThermal(heights, fieldWidth, fieldHeight, margin, talusHeight, erodeStrength);
    return extractCentre(heights, fieldWidth, width, height, margin);
  }

  return heights;
}

/** The inner `width` x `height` of a field grown by `margin` on every side. */
function extractCentre(
  field: Float32Array,
  fieldWidth: number,
  width: number,
  height: number,
  margin: number
): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = (y + margin) * fieldWidth + margin;
    out.set(field.subarray(src, src + width), y * width);
  }
  return out;
}
