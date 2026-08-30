import { BiomeLayer, BiomeParams, BiomeScatter, SelectorBand } from './Biomes';

// Smoothstep across a selector band. `from` > `to` inverts the ramp — the same
// function covers "fades in as the value rises" and "fades out as it rises".
// An absent band is unconstrained (1).
function bandCoverage(band: SelectorBand | undefined, value: number): number {
  if (!band) return 1;
  const t = (value - band.from) / (band.to - band.from);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

// A layer applies where all of its selectors do, so coverage is their product.
// `noiseValue` is this layer's noise field at the sample, already resolved by
// the caller (it needs a Perlin and world offsets this module has no business
// knowing about); it is ignored unless the layer carries a noise selector.
function layerCoverage(
  layer: BiomeLayer,
  height: number,
  slopeDegrees: number,
  noiseValue: number
): number {
  return (
    bandCoverage(layer.slope, slopeDegrees) *
    bandCoverage(layer.height, height) *
    bandCoverage(layer.noise?.band, noiseValue)
  );
}

/**
 * Weights for one biome's layers at a single sample: `out[i]` is the weight of
 * `biome.layers[i]`, and the written weights sum to exactly 1.
 *
 * Layers composite base-first, like painting. Walking from the top layer down,
 * each takes its coverage of whatever is still uncovered, and layers[0] soaks
 * up the remainder. So a fully-covering top layer wins outright, a partial one
 * lets the layers beneath show through, and the base needs no selector of its
 * own — it is simply what is left.
 *
 * `noiseValues[i]` is layer i's noise field at this sample, in 0..1 (see
 * sampleLayerNoise); entries for layers without a noise selector are never
 * read, so the caller need not fill them. Pass `null` when no layer in the
 * biome uses one.
 *
 * `out` is caller-owned and reused across samples (this runs once per texel);
 * it must be at least `biome.layers.length` long. Only indices
 * [0, layers.length) are written — the caller owns anything beyond that.
 */
export function resolveLayerWeights(
  biome: BiomeParams,
  height: number,
  slopeDegrees: number,
  noiseValues: Float64Array | null,
  out: Float64Array
): void {
  const layers = biome.layers;
  let remaining = 1;

  for (let i = layers.length - 1; i > 0; i--) {
    const covered =
      layerCoverage(
        layers[i],
        height,
        slopeDegrees,
        noiseValues ? noiseValues[i] : 0
      ) * remaining;
    out[i] = covered;
    remaining -= covered;
  }

  out[0] = remaining;
}

/**
 * A scatter rule's density at a single sample, in 0..1 of what the layer's
 * footprint allows.
 *
 * Unlike layer weights these do not composite — a rule is its own field — so
 * this is just the rule's density scaled by the product of its selectors.
 * `noiseValue` is the rule's noise field at the sample (see sampleLayerNoise),
 * ignored unless the rule carries a noise selector.
 */
export function resolveScatterDensity(
  rule: BiomeScatter,
  height: number,
  slopeDegrees: number,
  noiseValue: number
): number {
  return (
    rule.density *
    bandCoverage(rule.slope, slopeDegrees) *
    bandCoverage(rule.height, height) *
    bandCoverage(rule.noise?.band, noiseValue)
  );
}
