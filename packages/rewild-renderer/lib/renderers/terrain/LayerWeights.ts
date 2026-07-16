import { BiomeLayer, BiomeParams, SelectorBand } from './Biomes';

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
function layerCoverage(
  layer: BiomeLayer,
  height: number,
  slopeDegrees: number
): number {
  return (
    bandCoverage(layer.slope, slopeDegrees) *
    bandCoverage(layer.height, height)
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
 * `out` is caller-owned and reused across samples (this runs once per texel);
 * it must be at least `biome.layers.length` long. Only indices
 * [0, layers.length) are written — the caller owns anything beyond that.
 */
export function resolveLayerWeights(
  biome: BiomeParams,
  height: number,
  slopeDegrees: number,
  out: Float64Array
): void {
  const layers = biome.layers;
  let remaining = 1;

  for (let i = layers.length - 1; i > 0; i--) {
    const covered = layerCoverage(layers[i], height, slopeDegrees) * remaining;
    out[i] = covered;
    remaining -= covered;
  }

  out[0] = remaining;
}
