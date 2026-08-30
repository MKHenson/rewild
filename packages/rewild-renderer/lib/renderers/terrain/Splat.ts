import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  MAX_SPLAT_LAYERS,
  SPLAT_BYTES_PER_TEXEL,
  getClimatePalette,
  validateClimateLayers,
} from './Biomes';
import {
  createBiomeResolver,
  createClimateField,
  createLayerNoiseFields,
  resolveActiveBiomes,
  sampleLayerNoise,
} from './ClimateField';
import { resolveLayerWeights } from './LayerWeights';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { PaintMask } from './PaintMask';

// World units between adjacent heightmap samples — the run that the rise between
// neighbours is taken over, so the slope below comes out in real degrees.
//
// This was hardcoded to 1, with a comment claiming "241 samples spanning 240
// units". That stopped being true when the terrain gained a world scale: a chunk
// spans (chunkSize - 1) * TERRAIN_METERS_PER_SAMPLE, so the run is 2 m, not 1.
// Dividing the rise by half the real run made every slope read about twice its
// true steepness — atan(dh/1) where it should be atan(dh/2) — so a band written
// as 35°-75° actually opened at a true 19°, and cliff materials spread across
// ground that is merely rolling. Deriving it from the constant means it cannot
// drift from the world scale again.
const SAMPLE_SPACING = TERRAIN_METERS_PER_SAMPLE;

const RAD_TO_DEG = 180 / Math.PI;

/** An inclusive texel window of a chunk's splat map. */
export interface SplatRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SplatOptions {
  /**
   * Author-painted biome weights for this chunk (channel i = climate biome i).
   * Overrides the climate model in proportion to how hard each texel is
   * painted; omitted or null ⇒ pure climate, the generated world.
   */
  biomeMask?: PaintMask | null;
  /**
   * Write into this buffer instead of allocating one. Required for `region` —
   * a partial pass leaves every texel outside the window untouched, so it only
   * makes sense against a buffer that already holds a full map.
   */
  out?: Uint8Array;
  /** Only regenerate this window. Defaults to the whole chunk. */
  region?: SplatRegion;
}

/**
 * The heightfield's central-difference gradient at sample (x, y), written into
 * `out` as [dh/dx, dh/dy] — the shared basis for slope and surface normal.
 *
 * Edge samples fall back to a one-sided difference, which disagrees very
 * slightly with the same world position computed from the neighbouring chunk
 * (which has that sample in its interior). The disagreement is second-order in
 * the terrain's curvature and the layer selectors smoothstep over ~20°, so it
 * stays far below one quantisation step — but it is the reason a visible seam,
 * if one ever appears in the splat, would appear at chunk borders first.
 */
export function heightGradientAt(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array
): void {
  const x0 = x > 0 ? x - 1 : x;
  const x1 = x < width - 1 ? x + 1 : x;
  const y0 = y > 0 ? y - 1 : y;
  const y1 = y < height - 1 ? y + 1 : y;

  out[0] =
    (heights[y * width + x1] - heights[y * width + x0]) /
    ((x1 - x0) * SAMPLE_SPACING);
  out[1] =
    (heights[y1 * width + x] - heights[y0 * width + x]) /
    ((y1 - y0) * SAMPLE_SPACING);
}

const _gradient = new Float64Array(2);

export function slopeDegreesAt(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  heightGradientAt(heights, width, height, x, y, _gradient);
  const dhdx = _gradient[0];
  const dhdy = _gradient[1];
  return Math.atan(Math.sqrt(dhdx * dhdx + dhdy * dhdy)) * RAD_TO_DEG;
}

/**
 * Generates a chunk's splat map: `SPLAT_BYTES_PER_TEXEL` weights per texel,
 * where channel i is the weight of `getClimatePalette(climate)[i]` and the
 * weights sum to 1.
 *
 * The eight channels are two RGBA8 textures' worth, written as two consecutive
 * *planes* — every texel's channels 0-3, then every texel's channels 4-7 —
 * rather than eight interleaved bytes. That is the layout `writeTexture` wants:
 * each plane is a contiguous RGBA8 image the uploader points at with a byte
 * offset, so one buffer crosses the worker boundary and neither side repacks.
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
 *
 * A third answer overrides the first: `options.biomeMask`, the author's painted
 * biome weights. It replaces climate's answer to "which biome" in proportion to
 * how hard it was painted, and the climate model keeps the remainder — the same
 * "take your coverage of what is left" compositing the layers already use. It
 * deliberately does NOT feed height generation: heights are frozen the moment a
 * chunk is sculpted or snapshotted, so a painted biome that moved the ground
 * would either fight the sculpt or be silently ignored on saved chunks. Paint
 * says what the ground is made of; sculpt says what shape it is.
 */
export function generateSplatMap(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  heights: Float32Array,
  options?: SplatOptions
): Uint8Array {
  if (heights.length !== width * height)
    throw new Error(
      `Splat generation needs ${width * height} heights, got ${heights.length}.`
    );
  validateClimateLayers(climate);

  const biomeMask = options?.biomeMask ?? null;
  if (biomeMask && biomeMask.channels !== climate.biomes.length)
    throw new Error(
      `Biome mask has ${biomeMask.channels} channels but the climate has ${climate.biomes.length} biomes.`
    );

  const palette = getClimatePalette(climate);
  const field = createClimateField(width, height, seed, offset, climate);
  const expectedBytes = width * height * SPLAT_BYTES_PER_TEXEL;
  const out = options?.out;
  if (out && out.length !== expectedBytes)
    throw new Error(
      `Splat output buffer is ${out.length} bytes; expected ${expectedBytes}.`
    );
  const splat = out ?? new Uint8Array(expectedBytes);
  // Where the second plane (channels 4-7) starts.
  const planeStride = width * height * 4;

  // Texel window to (re)generate. A paint stroke only invalidates the disc under
  // the brush, and regenerating 241² texels — each of which resolves several
  // octaves of climate noise — per stamp is what would make painting stutter.
  // Defaults to the whole chunk, which is what every generation path wants.
  const region = options?.region;
  // Without `out` a partial pass would return a freshly allocated map that is
  // zero everywhere outside the window — a silently corrupt splat rather than a
  // patched one. Fail instead of producing it.
  if (region && !out)
    throw new Error('Splat region requires an `out` buffer to patch into.');
  const rx0 = region ? Math.max(0, region.x0) : 0;
  const ry0 = region ? Math.max(0, region.y0) : 0;
  const rx1 = region ? Math.min(width - 1, region.x1) : width - 1;
  const ry1 = region ? Math.min(height - 1, region.y1) : height - 1;
  if (rx1 < rx0 || ry1 < ry0) return splat;

  // Per-biome map from layer index → splat channel, resolved up front so the
  // sample loop never does a name lookup.
  const biomeChannels: Int32Array[] = climate.biomes.map((biome) =>
    Int32Array.from(
      biome.layers.map((layer) => palette.indexOf(layer.material))
    )
  );

  let maxLayers = 1;
  for (const biome of climate.biomes)
    maxLayers = Math.max(maxLayers, biome.layers.length);

  // Noise-selector lookups per (biome, layer), null where a layer has none.
  // `anyLayerNoise` lets the common case skip the per-layer sampling entirely.
  const layerNoiseFields = createLayerNoiseFields(seed, offset, climate);
  const anyLayerNoise = layerNoiseFields.some((biome) =>
    biome.some((layerField) => layerField !== null)
  );

  // Scratch reused across samples — nothing is allocated in the loop.
  const resolver = createBiomeResolver(field, biomeMask);
  const activeBiomes = resolver.biomes;
  const activeWeights = resolver.weights;
  const layerWeights = new Float64Array(maxLayers);
  const layerNoise = new Float64Array(maxLayers);
  const channels = new Float64Array(MAX_SPLAT_LAYERS);

  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      const index = x + y * width;
      const worldHeight = heights[index];
      const slope = slopeDegreesAt(heights, width, height, x, y);

      channels.fill(0);

      const activeCount = resolveActiveBiomes(resolver, x, y);

      for (let b = 0; b < activeCount; b++) {
        const biomeIndex = activeBiomes[b];
        const biome = climate.biomes[biomeIndex];
        const biomeWeight = activeWeights[b];

        // Each noise-selecting layer's field at this sample. Sampled here
        // rather than inside resolveLayerWeights so that module stays free of
        // the Perlin and the world offsets.
        if (anyLayerNoise) {
          const noiseFields = layerNoiseFields[biomeIndex];
          for (let l = 0; l < noiseFields.length; l++) {
            const noiseField = noiseFields[l];
            layerNoise[l] = noiseField
              ? sampleLayerNoise(
                  field.perlin,
                  noiseField,
                  field.halfWidth,
                  field.halfHeight,
                  x,
                  y
                )
              : 0;
          }
        }

        resolveLayerWeights(
          biome,
          worldHeight,
          slope,
          anyLayerNoise ? layerNoise : null,
          layerWeights
        );

        const layerChannels = biomeChannels[biomeIndex];
        for (let l = 0; l < biome.layers.length; l++) {
          channels[layerChannels[l]] += biomeWeight * layerWeights[l];
        }
      }

      // Quantisation loses up to 1/255 per channel, so the eight no longer sum
      // to exactly 255. The shader renormalises rather than the fix-up being
      // done here — linear filtering preserves the sum, so one normalise in the
      // fragment covers both errors at once.
      const base = index * 4;
      splat[base] = Math.round(channels[0] * 255);
      splat[base + 1] = Math.round(channels[1] * 255);
      splat[base + 2] = Math.round(channels[2] * 255);
      splat[base + 3] = Math.round(channels[3] * 255);
      splat[planeStride + base] = Math.round(channels[4] * 255);
      splat[planeStride + base + 1] = Math.round(channels[5] * 255);
      splat[planeStride + base + 2] = Math.round(channels[6] * 255);
      splat[planeStride + base + 3] = Math.round(channels[7] * 255);
    }
  }

  return splat;
}
