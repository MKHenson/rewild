import { Perlin, Vector2 } from 'rewild-common';
import {
  ClimateAxis,
  ClimateConfig,
  ContinentConfig,
  NoiseSelector,
} from './Biomes';
import { PaintMask, samplePaintMask } from './PaintMask';

// Per-sample climate resolution: which biome(s) a world position is in, and in
// what proportion.
//
// Shared by height generation (Noise.ts) and splat generation (Splat.ts) rather
// than duplicated, because the two must agree exactly. If materials resolved
// their own biome weights they would drift from the ones that shaped the
// terrain, and a mountain's rock would stop somewhere other than the mountain.
//
// This is also why the splat can be derived for a *sculpted* chunk: climate is
// a pure function of (seed, world position, preset) and owes nothing to the
// heightfield, so it resolves identically whether the heights were generated or
// loaded from a snapshot.

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// Domain warp for biome borders. The climate noise is deliberately very low
// frequency (a band spans many chunks), so across a single view its iso-line —
// the biome border — is nearly a straight gradient. Displacing the lookup
// position by a higher-frequency noise makes that border meander organically
// WITHOUT changing biome size: the value distribution is unchanged, only where
// each sample reads from. The warp is a function of absolute sample position
// (like the climate noise), so borders stay seam-free across chunks, and both
// axes share one warp so their borders wander coherently.
//
// Tuning (both in sample units, multiply by metersPerSample for world units):
//   WARP_SAMPLE_SCALE - wiggle wavelength. Keep it near the biome `scale`.
//   WARP_AMPLITUDE    - how far the border wanders. Higher fragments biomes
//                       into islands.
//
// WARP_AMPLITUDE / WARP_SAMPLE_SCALE must stay below 0.18. Above that the warp
// folds: d(sx)/dx turns negative, so two climate values land on one position.
// The border is then a discontinuity and blendHalfWidth cannot widen it.
const WARP_SAMPLE_SCALE = 2800;
const WARP_AMPLITUDE = 350;

// The continent field's octave stack. The first octave sets where the oceans
// are; the rest cut bays and headlands into the coast.
const CONTINENT_OCTAVES = 4;
const CONTINENT_PERSISTENCE = 0.5;
const CONTINENT_LACUNARITY = 2;
const CONTINENT_MAX_AMPLITUDE =
  (1 - Math.pow(CONTINENT_PERSISTENCE, CONTINENT_OCTAVES)) /
  (1 - CONTINENT_PERSISTENCE);

// Which band an axis value falls in, plus the smoothstep blend into the next
// band when the value sits inside a cut's transition zone. bandB === bandA
// (with weight 0) outside transition zones.
interface ResolvedAxis {
  bandA: number;
  bandB: number;
  weight: number;
}

function resolveAxis(
  value: number,
  axis: ClimateAxis,
  out: ResolvedAxis
): void {
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

// Everything needed to resolve climate for one chunk: the noise field, the
// per-axis world offsets, and scratch reused across samples. Built once per
// generation call — never per sample.
export interface ClimateField {
  perlin: Perlin;
  climate: ClimateConfig;
  halfWidth: number;
  halfHeight: number;
  tOffsetX: number;
  tOffsetY: number;
  mOffsetX: number;
  mOffsetY: number;
  // Decorrelated world offsets for the domain-warp noise field.
  warpOffsetX: number;
  warpOffsetY: number;
  // Per-octave world offsets for the continent field; null when the climate
  // has no continent.
  continentOffsetsX: Float64Array | null;
  continentOffsetsY: Float64Array | null;
  // An axis with no cuts has a single band — skip its noise entirely.
  sampleTemperature: boolean;
  sampleMoisture: boolean;
  // Scratch (single-threaded per generation call).
  t: ResolvedAxis;
  m: ResolvedAxis;
}

export function createClimateField(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig
): ClimateField {
  const tAxis = climate.temperature;
  const mAxis = climate.moisture;

  // Per-axis world offsets, salted so each axis is independent of the height
  // noise and of the other axis while staying seed-deterministic. Offsets carry
  // the chunk position with the same sign convention as the height noise, so
  // climate values are world-continuous across chunk borders.
  const tRng = seededRandom(seed + tAxis.seedSalt);
  const tOffsetX = tRng() * 200000 - 100000 + offset.x;
  const tOffsetY = tRng() * 200000 - 100000 + offset.y;
  const mRng = seededRandom(seed + mAxis.seedSalt);
  const mOffsetX = mRng() * 200000 - 100000 + offset.x;
  const mOffsetY = mRng() * 200000 - 100000 + offset.y;

  // Warp field salt: fixed, decorrelated from both climate axes and the height
  // noise, kept seed-deterministic and carrying the chunk offset for continuity.
  const wRng = seededRandom(seed + 5501);
  const warpOffsetX = wRng() * 200000 - 100000 + offset.x;
  const warpOffsetY = wRng() * 200000 - 100000 + offset.y;

  let continentOffsetsX: Float64Array | null = null;
  let continentOffsetsY: Float64Array | null = null;
  if (climate.continent) {
    const cRng = seededRandom(seed + climate.continent.seedSalt);
    continentOffsetsX = new Float64Array(CONTINENT_OCTAVES);
    continentOffsetsY = new Float64Array(CONTINENT_OCTAVES);
    for (let o = 0; o < CONTINENT_OCTAVES; o++) {
      continentOffsetsX[o] = cRng() * 200000 - 100000 + offset.x;
      continentOffsetsY[o] = cRng() * 200000 - 100000 + offset.y;
    }
  }

  return {
    perlin: new Perlin(seed),
    climate,
    halfWidth: width / 2,
    halfHeight: height / 2,
    tOffsetX,
    tOffsetY,
    mOffsetX,
    mOffsetY,
    warpOffsetX,
    warpOffsetY,
    continentOffsetsX,
    continentOffsetsY,
    sampleTemperature: tAxis.cuts.length > 0,
    sampleMoisture: mAxis.cuts.length > 0,
    t: { bandA: 0, bandB: 0, weight: 0 },
    m: { bandA: 0, bandB: 0, weight: 0 },
  };
}

// The lookup for one layer's noise selector, resolved once per generation call.
// `scale` is copied from the selector; the offsets carry the layer's salt *and*
// the chunk position, exactly as the climate axes do — which is what makes the
// field world-continuous, so a noise-selected patch crosses a chunk border
// without a seam.
export interface LayerNoiseField {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Per-(biome, layer) noise lookups for every layer carrying a noise selector;
 * `null` for layers without one. Indexed `[biomeIndex][layerIndex]`, built once
 * per generation call so the sample loop only ever indexes.
 */
export function createLayerNoiseFields(
  seed: number,
  offset: Vector2,
  climate: ClimateConfig
): (LayerNoiseField | null)[][] {
  return climate.biomes.map((biome) =>
    biome.layers.map((layer) => createNoiseField(seed, offset, layer.noise))
  );
}

/**
 * The same, per (biome, scatter rule). Scatter rules carry the same noise
 * selector as layers do, so they get the same world-continuous field.
 */
export function createScatterNoiseFields(
  seed: number,
  offset: Vector2,
  climate: ClimateConfig
): (LayerNoiseField | null)[][] {
  return climate.biomes.map((biome) =>
    (biome.scatter ?? []).map((rule) =>
      createNoiseField(seed, offset, rule.noise)
    )
  );
}

function createNoiseField(
  seed: number,
  offset: Vector2,
  selector: NoiseSelector | undefined
): LayerNoiseField | null {
  if (!selector) return null;
  const rng = seededRandom(seed + selector.seedSalt);
  return {
    offsetX: rng() * 200000 - 100000 + offset.x,
    offsetY: rng() * 200000 - 100000 + offset.y,
    scale: selector.scale,
  };
}

/**
 * A layer's noise value in 0..1 at chunk-local sample (x, y).
 *
 * Takes primitives rather than the ClimateField so it allocates nothing and the
 * caller can hoist the field lookup out of the inner loop.
 */
export function sampleLayerNoise(
  perlin: Perlin,
  field: LayerNoiseField,
  halfWidth: number,
  halfHeight: number,
  x: number,
  y: number
): number {
  // Same sign convention as the climate axes and the height noise — y enters
  // negatively — so every field in the system agrees about where a world
  // position is.
  return (
    (perlin.simplex2(
      (x - halfWidth + field.offsetX) / field.scale,
      (y - halfHeight - field.offsetY) / field.scale
    ) +
      1) *
    0.5
  );
}

/**
 * The continent field at chunk-local sample (x, y), in 0..1. Values below the
 * climate's `continent.coast` are ocean. Returns 1 (inland) for a climate with
 * no continent.
 */
export function sampleContinent(
  field: ClimateField,
  x: number,
  y: number
): number {
  const continent = field.climate.continent;
  const offsetsX = field.continentOffsetsX;
  const offsetsY = field.continentOffsetsY;
  if (!continent || !offsetsX || !offsetsY) return 1;

  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  for (let o = 0; o < CONTINENT_OCTAVES; o++) {
    sum +=
      field.perlin.simplex2(
        ((x - field.halfWidth + offsetsX[o]) / continent.scale) * frequency,
        ((y - field.halfHeight - offsetsY[o]) / continent.scale) * frequency
      ) * amplitude;
    amplitude *= CONTINENT_PERSISTENCE;
    frequency *= CONTINENT_LACUNARITY;
  }
  return (sum / CONTINENT_MAX_AMPLITUDE + 1) * 0.5;
}

/**
 * How much of the land height survives at continent value `c`: 1 inland, 0 on
 * the sea bed, smoothstepped across `blendHalfWidth` either side of the coast.
 */
export function continentLandWeight(
  continent: ContinentConfig,
  c: number
): number {
  const half = continent.blendHalfWidth;
  const t = (c - (continent.coast - half)) / (2 * half);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * How much ocean may stand at continent value `c`: all of it out to where the
 * land is at full height, then fading over one more blend width inland. Land
 * past that stays dry even below sea level. Also how close the ocean is, for
 * beaches.
 */
export function oceanCoverage(continent: ContinentConfig, c: number): number {
  const half = continent.blendHalfWidth;
  const t = (c - (continent.coast + half)) / half;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Moisture added at continent value `c`: the continent's coastalMoisture at the
 * coast and seaward, fading to nothing coastalMoistureReach inland.
 */
export function coastalMoistureAt(continent: ContinentConfig, c: number): number {
  const amount = continent.coastalMoisture ?? 0;
  const reach = continent.coastalMoistureReach ?? 0;
  if (amount === 0 || reach <= 0) return 0;
  const t = (c - continent.coast) / reach;
  if (t <= 0) return amount;
  if (t >= 1) return 0;
  return amount * (1 - t * t * (3 - 2 * t));
}

/**
 * Metres below sea level of the sea bed at continent value `c`: 0 at the coast,
 * falling linearly across the shelf, then down the slope to the ocean floor.
 */
export function continentSeabedDepth(
  continent: ContinentConfig,
  c: number
): number {
  const u = continent.coast - c;
  if (u <= 0) return 0;

  const shelf = continent.shelfDepth * Math.min(1, u / continent.shelfWidth);
  let t = (u - continent.shelfWidth) / continent.slopeWidth;
  if (t <= 0) return shelf;
  if (t > 1) t = 1;
  return (
    shelf + (continent.oceanDepth - continent.shelfDepth) * t * t * (3 - 2 * t)
  );
}

/**
 * Resolves the biome(s) active at chunk-local sample (x, y) into `outBiomes` /
 * `outWeights`, returning how many are active. Weights sum to 1.
 *
 * Bilinear over the (up to four) neighbouring climate cells; cells sharing a
 * biome merge, so each biome appears at most once and exactly one is active
 * away from a transition band. `outBiomes`/`outWeights` must hold 4 and are
 * caller-owned scratch — this runs once per texel.
 */
export function resolveBiomeWeights(
  field: ClimateField,
  x: number,
  y: number,
  outBiomes: Int32Array,
  outWeights: Float64Array
): number {
  const { perlin, climate, halfWidth, halfHeight, t, m } = field;
  const cells = climate.cells;

  // Domain-warp the lookup so biome borders meander instead of tracing the
  // low-frequency climate gradient in a straight line. One warp vector, shared
  // by both axes; the +137.13 / -91.7 constant shifts decorrelate its two
  // components from the same noise field. No-op when there is nothing to split.
  let sx = x;
  let sy = y;
  if (field.sampleTemperature || field.sampleMoisture) {
    const wx = (x - halfWidth + field.warpOffsetX) / WARP_SAMPLE_SCALE;
    const wy = (y - halfHeight - field.warpOffsetY) / WARP_SAMPLE_SCALE;
    sx = x + perlin.simplex2(wx, wy) * WARP_AMPLITUDE;
    sy = y + perlin.simplex2(wx + 137.13, wy - 91.7) * WARP_AMPLITUDE;
  }

  if (field.sampleTemperature) {
    const tAxis = climate.temperature;
    const tValue =
      (perlin.simplex2(
        (sx - halfWidth + field.tOffsetX) / tAxis.scale,
        (sy - halfHeight - field.tOffsetY) / tAxis.scale
      ) +
        1) *
      0.5;
    resolveAxis(tValue, tAxis, t);
  }
  if (field.sampleMoisture) {
    const mAxis = climate.moisture;
    let mValue =
      (perlin.simplex2(
        (sx - halfWidth + field.mOffsetX) / mAxis.scale,
        (sy - halfHeight - field.mOffsetY) / mAxis.scale
      ) +
        1) *
      0.5;
    // Wetter near the ocean. Read at the unwarped position, where the coast is.
    const continent = climate.continent;
    if (continent?.coastalMoisture)
      mValue += coastalMoistureAt(continent, sampleContinent(field, x, y));
    resolveAxis(mValue, mAxis, m);
  }

  let activeCount = addCell(
    outBiomes,
    outWeights,
    0,
    cells[t.bandA][m.bandA],
    (1 - t.weight) * (1 - m.weight)
  );
  if (m.bandB !== m.bandA)
    activeCount = addCell(
      outBiomes,
      outWeights,
      activeCount,
      cells[t.bandA][m.bandB],
      (1 - t.weight) * m.weight
    );
  if (t.bandB !== t.bandA) {
    activeCount = addCell(
      outBiomes,
      outWeights,
      activeCount,
      cells[t.bandB][m.bandA],
      t.weight * (1 - m.weight)
    );
    if (m.bandB !== m.bandA)
      activeCount = addCell(
        outBiomes,
        outWeights,
        activeCount,
        cells[t.bandB][m.bandB],
        t.weight * m.weight
      );
  }

  return activeCount;
}

// Painted biomes merged with the climate's own, so splat and scatter cannot
// disagree about which biome is where. Holds every scratch buffer the merge
// needs, built once per generation call.
export interface BiomeResolver {
  field: ClimateField;
  biomeMask: PaintMask | null;
  /** Merged result of the last resolveActiveBiomes call. */
  biomes: Int32Array;
  weights: Float64Array;
  paintWeights: Float64Array;
  climateBiomes: Int32Array;
  climateWeights: Float64Array;
}

export function createBiomeResolver(
  field: ClimateField,
  biomeMask: PaintMask | null
): BiomeResolver {
  const biomeCount = field.climate.biomes.length;
  return {
    field,
    biomeMask,
    // Painted biomes merge with the (up to four) climate biomes, so the list
    // can hold both — in practice they overlap heavily and it stays short.
    biomes: new Int32Array(4 + biomeCount),
    weights: new Float64Array(4 + biomeCount),
    paintWeights: new Float64Array(biomeCount),
    climateBiomes: new Int32Array(4),
    climateWeights: new Float64Array(4),
  };
}

/**
 * The biomes active at sample (x, y), written into `resolver.biomes` /
 * `resolver.weights`; returns how many. Weights sum to 1.
 *
 * Paint goes first, taking its weight outright, and the climate model is scaled
 * into what is left — the same "take your coverage of the remainder"
 * compositing the layers use. Where paint saturates the climate noise is
 * skipped entirely, so a fully painted region costs no noise evaluations.
 */
export function resolveActiveBiomes(
  resolver: BiomeResolver,
  x: number,
  y: number
): number {
  const { biomeMask, paintWeights, biomes, weights } = resolver;
  let count = 0;
  let painted = 0;

  if (biomeMask) {
    painted = samplePaintMask(biomeMask, x, y, paintWeights);
    for (let c = 0; c < paintWeights.length; c++) {
      if (paintWeights[c] <= 0) continue;
      biomes[count] = c;
      weights[count] = paintWeights[c];
      count++;
    }
  }

  const climateScale = 1 - painted;
  if (climateScale <= 0) return count;

  const climateBiomes = resolver.climateBiomes;
  const climateWeights = resolver.climateWeights;
  const climateCount = resolveBiomeWeights(
    resolver.field,
    x,
    y,
    climateBiomes,
    climateWeights
  );

  for (let b = 0; b < climateCount; b++) {
    const biomeIndex = climateBiomes[b];
    const weight = climateWeights[b] * climateScale;

    // A biome can be both painted and climate-native here; merging keeps it
    // evaluated once, exactly as the climate cells already merge.
    let merged = false;
    for (let j = 0; j < count; j++) {
      if (biomes[j] === biomeIndex) {
        weights[j] += weight;
        merged = true;
        break;
      }
    }
    if (merged) continue;

    biomes[count] = biomeIndex;
    weights[count] = weight;
    count++;
  }

  return count;
}
