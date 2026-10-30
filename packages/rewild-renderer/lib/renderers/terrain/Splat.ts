import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  MAX_SPLAT_LAYERS,
  SPLAT_BYTES_PER_TEXEL,
  validateClimateLayers,
} from './Biomes';
import { PaintMask } from './PaintMask';
import { terrainGenerator } from './TerrainGenerator';

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
  /** World height of the sea, which the beach bands are measured from. */
  seaLevel?: number;
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
 *
 * Generated in Rust (`SplatGenerator` in rewild-wasm's terrain crate), from the
 * same climate grid the heights use.
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

  const expectedBytes = width * height * SPLAT_BYTES_PER_TEXEL;
  const out = options?.out;
  if (out && out.length !== expectedBytes)
    throw new Error(
      `Splat output buffer is ${out.length} bytes; expected ${expectedBytes}.`
    );
  const splat = out ?? new Uint8Array(expectedBytes);

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

  terrainGenerator(seed, climate, options?.seaLevel ?? 0).splat(
    heights,
    width,
    height,
    offset.x,
    offset.y,
    biomeMask?.weights,
    biomeMask?.size ?? 0,
    biomeMask?.step ?? 0,
    rx0,
    ry0,
    rx1,
    ry1,
    splat
  );
  return splat;
}

/**
 * Writes the `MAX_SPLAT_LAYERS` weights, 0..1, at sample (`fx`, `fy`) of a
 * `size` × `size` splat map into `out`, bilinearly blended between texels.
 * The position is clamped to the map.
 */
export function sampleSplatMap(
  splat: Uint8Array,
  size: number,
  fx: number,
  fy: number,
  out: Float32Array
): void {
  const max = size - 1;
  const x = Math.min(max, Math.max(0, fx));
  const y = Math.min(max, Math.max(0, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, max);
  const y1 = Math.min(y0 + 1, max);
  const tx = x - x0;
  const ty = y - y0;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const t00 = (y0 * size + x0) * 4;
  const t10 = (y0 * size + x1) * 4;
  const t01 = (y1 * size + x0) * 4;
  const t11 = (y1 * size + x1) * 4;
  const planeStride = size * size * 4;
  for (let c = 0; c < MAX_SPLAT_LAYERS; c++) {
    const o = (c >> 2) * planeStride + (c & 3);
    out[c] =
      (splat[t00 + o] * w00 +
        splat[t10 + o] * w10 +
        splat[t01 + o] * w01 +
        splat[t11 + o] * w11) /
      255;
  }
}
