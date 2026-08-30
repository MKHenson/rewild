import { Perlin, Vector2 } from 'rewild-common';
import { ClimateAxis, ClimateConfig, NoiseSelector } from './Biomes';

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
// Tuning (both in sample units — multiply by metersPerSample for world units):
//   WARP_SAMPLE_SCALE — wiggle wavelength; keep well below the biome `scale` so
//                       wiggles are finer than the biomes but not noisy.
//   WARP_AMPLITUDE    — how far the border wanders; ~0.2–0.4 × biome `scale`
//                       reads as natural. Higher fragments biomes into islands.
const WARP_SAMPLE_SCALE = 1000;
const WARP_AMPLITUDE = 350;

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
    const mValue =
      (perlin.simplex2(
        (sx - halfWidth + field.mOffsetX) / mAxis.scale,
        (sy - halfHeight - field.mOffsetY) / mAxis.scale
      ) +
        1) *
      0.5;
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
