import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  MAX_SPLAT_LAYERS,
  getClimatePalette,
  validateClimateLayers,
} from './Biomes';
import { createClimateField, resolveBiomeWeights } from './ClimateField';
import { resolveLayerWeights } from './LayerWeights';

// Samples are one world unit apart (241 samples spanning 240 units), so a
// height difference between neighbours *is* the per-unit gradient.
const SAMPLE_SPACING = 1;

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Terrain slope in degrees from horizontal at sample (x, y), by central
 * difference on the heightfield.
 *
 * Edge samples fall back to a one-sided difference, which disagrees very
 * slightly with the same world position computed from the neighbouring chunk
 * (which has that sample in its interior). The disagreement is second-order in
 * the terrain's curvature and the layer selectors smoothstep over ~20°, so it
 * stays far below one quantisation step — but it is the reason a visible seam,
 * if one ever appears in the splat, would appear at chunk borders first.
 */
function slopeDegreesAt(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const x0 = x > 0 ? x - 1 : x;
  const x1 = x < width - 1 ? x + 1 : x;
  const y0 = y > 0 ? y - 1 : y;
  const y1 = y < height - 1 ? y + 1 : y;

  const dhdx =
    (heights[y * width + x1] - heights[y * width + x0]) /
    ((x1 - x0) * SAMPLE_SPACING);
  const dhdy =
    (heights[y1 * width + x] - heights[y0 * width + x]) /
    ((y1 - y0) * SAMPLE_SPACING);

  return Math.atan(Math.sqrt(dhdx * dhdx + dhdy * dhdy)) * RAD_TO_DEG;
}

/**
 * Generates a chunk's splat map: RGBA8 where channel i is the weight of
 * `getClimatePalette(climate)[i]`, and the four weights sum to 1.
 *
 * Two questions, answered by different things:
 *   - **which biome** — the climate model, a pure function of (seed, world
 *     position, preset). Height cannot answer this: biome height ranges
 *     overlap, and terrain is tall *because* it is a mountain.
 *   - **which material within that biome** — the biome's layer rules, read off
 *     the heights this chunk actually has.
 *
 * Because climate owes nothing to the heightfield, this works identically for a
 * chunk whose heights were generated and one whose heights came from a sculpt
 * snapshot — which is what lets a sculpted peak grow snow for free, and why no
 * snapshot format change was needed.
 */
export function generateSplatMap(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  heights: Float32Array
): Uint8Array {
  if (heights.length !== width * height)
    throw new Error(
      `Splat generation needs ${width * height} heights, got ${heights.length}.`
    );
  validateClimateLayers(climate);

  const palette = getClimatePalette(climate);
  const field = createClimateField(width, height, seed, offset, climate);
  const splat = new Uint8Array(width * height * 4);

  // Per-biome map from layer index → splat channel, resolved up front so the
  // sample loop never does a name lookup.
  const biomeChannels: Int32Array[] = climate.biomes.map((biome) =>
    Int32Array.from(biome.layers.map((layer) => palette.indexOf(layer.material)))
  );

  let maxLayers = 1;
  for (const biome of climate.biomes)
    maxLayers = Math.max(maxLayers, biome.layers.length);

  // Scratch reused across samples — nothing is allocated in the loop.
  const activeBiomes = new Int32Array(4);
  const activeWeights = new Float64Array(4);
  const layerWeights = new Float64Array(maxLayers);
  const channels = new Float64Array(MAX_SPLAT_LAYERS);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = x + y * width;
      const worldHeight = heights[index];
      const slope = slopeDegreesAt(heights, width, height, x, y);

      channels.fill(0);

      const activeCount = resolveBiomeWeights(
        field,
        x,
        y,
        activeBiomes,
        activeWeights
      );

      for (let b = 0; b < activeCount; b++) {
        const biomeIndex = activeBiomes[b];
        const biome = climate.biomes[biomeIndex];
        const biomeWeight = activeWeights[b];

        resolveLayerWeights(biome, worldHeight, slope, layerWeights);

        const layerChannels = biomeChannels[biomeIndex];
        for (let l = 0; l < biome.layers.length; l++) {
          channels[layerChannels[l]] += biomeWeight * layerWeights[l];
        }
      }

      // Quantisation loses up to 1/255 per channel, so the four no longer sum
      // to exactly 255. The shader renormalises rather than the fix-up being
      // done here — linear filtering preserves the sum, so one normalise in the
      // fragment covers both errors at once.
      const base = index * 4;
      splat[base] = Math.round(channels[0] * 255);
      splat[base + 1] = Math.round(channels[1] * 255);
      splat[base + 2] = Math.round(channels[2] * 255);
      splat[base + 3] = Math.round(channels[3] * 255);
    }
  }

  return splat;
}
