// Per-chunk paint masks: an author-painted weight field that overrides what the
// generator would have produced, stored per chunk and persisted alongside the
// height snapshot.
//
// The container is deliberately generic — N channels of u8 weight over a square
// grid at a stated resolution. Today the only user is the biome painter, where a
// channel is an index into `ClimateConfig.biomes` and the mask overrides the
// *input* to splat generation (which biome is here). The same container is what
// a future direct-material painter (a pond bed, a worn clearing) would use, at a
// finer `step` and with channels meaning palette slots instead — that one
// overrides the *output* side, compositing over the resolved layers. The scatter
// density painter is the second user of the input side: channels are scatter
// layer slots at a coarser `step`, and its weights do not compete (see
// `independentChannels`). Keeping one container means one format, one sampler
// and one brush for all of them.
//
// Coordinate model — mask texels sit ON LOD-0 samples, every `step` samples:
//   texel (mx, my) is LOD-0 sample (mx * step, my * step)
//   size = (chunkSize - 1) / step + 1
// So the first and last rows/columns land exactly on the chunk's shared edges,
// which is what lets adjacent chunks agree there (see applyPaintStamp).
//
// Resolution is a judgement about the *field*, not the texture: biome is a
// low-frequency quantity by construction (a climate band spans many chunks), so
// a quarter-resolution mask bilinearly interpolated is indistinguishable from a
// per-sample one while costing 1/16th the bytes — 61² × channels instead of
// 241². A material mask painting something thin and sharp would carry its own
// (smaller) step; the format stores it rather than assuming it.

export const PAINT_MASK_VERSION = 1;
export const PAINT_MASK_HEADER_BYTES = 20;
export const PAINT_MASK_FLAG_COMPRESSED = 1;

// LOD-0 samples per biome-mask texel. With chunkSize 241 this gives a 61² mask.
export const BIOME_MASK_STEP = 4;

// LOD-0 samples per scatter-density texel — a 31² mask at chunkSize 241.
// Coarser than the biome mask because scatter density is a coarser field still:
// the brush paints where a stand of trees is, and the placer's own jittered grid
// supplies everything finer than that.
export const SCATTER_MASK_STEP = 8;

export interface PaintMask {
  /** Texels per side. */
  size: number;
  /** LOD-0 samples per texel. */
  step: number;
  /** How many weight planes the mask carries. */
  channels: number;
  /**
   * Channel-major weight planes, 0..255: `weights[c * size * size + my * size + mx]`.
   * Channel-major (not interleaved) so one channel's plane is contiguous — the
   * layout a future per-channel upload or compression wants.
   */
  weights: Uint8Array;
}

/** Texels per side for a chunk of `chunkSize` LOD-0 samples at `step`. */
export function paintMaskSize(chunkSize: number, step: number): number {
  const span = chunkSize - 1;
  if (span <= 0 || step <= 0 || span % step !== 0)
    throw new Error(
      `Paint mask step ${step} must divide the chunk span ${span} exactly.`
    );
  return span / step + 1;
}

export function createPaintMask(
  chunkSize: number,
  channels: number,
  step: number = BIOME_MASK_STEP
): PaintMask {
  if (!Number.isInteger(channels) || channels <= 0)
    throw new Error(`Paint mask needs at least one channel, got ${channels}.`);
  const size = paintMaskSize(chunkSize, step);
  return {
    size,
    step,
    channels,
    weights: new Uint8Array(size * size * channels),
  };
}

/**
 * True when nothing has been painted — every texel is zero, so the chunk
 * resolves purely from the generator. Callers use this to skip the mask
 * entirely (and to avoid persisting an empty blob).
 */
export function isPaintMaskEmpty(mask: PaintMask): boolean {
  const weights = mask.weights;
  for (let i = 0; i < weights.length; i++) if (weights[i] !== 0) return false;
  return true;
}

/**
 * True when `channel` has never been painted. Lets a caller skip a layer slot
 * whose plane is entirely zero without walking it again per sample.
 */
export function isPaintMaskChannelEmpty(
  mask: PaintMask,
  channel: number
): boolean {
  if (channel < 0 || channel >= mask.channels) return true;
  const plane = mask.size * mask.size;
  const base = channel * plane;
  for (let i = 0; i < plane; i++)
    if (mask.weights[base + i] !== 0) return false;
  return true;
}

/**
 * Bilinearly samples one channel at LOD-0 sample (x, y) as a 0..1 weight.
 *
 * The counterpart to samplePaintMask for masks whose channels are independent
 * quantities rather than a budget shared between them — a scatter layer's
 * density says nothing about its neighbour slot's, so there is nothing to
 * renormalise and no reason to read the other planes.
 */
export function samplePaintMaskChannel(
  mask: PaintMask,
  channel: number,
  x: number,
  y: number
): number {
  if (channel < 0 || channel >= mask.channels) return 0;

  const { size, step, weights } = mask;
  const max = size - 1;

  const fx = x / step;
  const fy = y / step;
  let x0 = Math.floor(fx);
  let y0 = Math.floor(fy);
  if (x0 < 0) x0 = 0;
  else if (x0 > max) x0 = max;
  if (y0 < 0) y0 = 0;
  else if (y0 > max) y0 = max;
  const x1 = x0 < max ? x0 + 1 : x0;
  const y1 = y0 < max ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;

  const base = channel * size * size;
  const w00 = weights[base + y0 * size + x0];
  const w10 = weights[base + y0 * size + x1];
  const w01 = weights[base + y1 * size + x0];
  const w11 = weights[base + y1 * size + x1];

  const top = w00 + (w10 - w00) * tx;
  const bottom = w01 + (w11 - w01) * tx;
  return (top + (bottom - top) * ty) / 255;
}

/**
 * Bilinearly samples every channel at LOD-0 sample (x, y) into `out` (length
 * >= mask.channels, caller-owned scratch) as 0..1 weights, and returns their
 * total.
 *
 * The total is what the caller divides the generator's own result by: painted
 * weight takes its share and the generator keeps the remainder, which is the
 * same "each layer takes its coverage of what is left" rule the material layers
 * already composite by (see resolveLayerWeights). It is clamped to 1 because
 * the brush keeps the stored channels summing to <= 1 but quantisation can push
 * an interpolated total a hair over.
 *
 * Allocation-free: the caller hoists `out`, and every index below is arithmetic.
 */
export function samplePaintMask(
  mask: PaintMask,
  x: number,
  y: number,
  out: Float64Array
): number {
  const { size, step, channels, weights } = mask;
  const max = size - 1;

  const fx = x / step;
  const fy = y / step;
  let x0 = Math.floor(fx);
  let y0 = Math.floor(fy);
  if (x0 < 0) x0 = 0;
  else if (x0 > max) x0 = max;
  if (y0 < 0) y0 = 0;
  else if (y0 > max) y0 = max;
  const x1 = x0 < max ? x0 + 1 : x0;
  const y1 = y0 < max ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = y0 * size + x0;
  const i10 = y0 * size + x1;
  const i01 = y1 * size + x0;
  const i11 = y1 * size + x1;
  const plane = size * size;

  let total = 0;
  for (let c = 0; c < channels; c++) {
    const base = c * plane;
    const top =
      weights[base + i00] + (weights[base + i10] - weights[base + i00]) * tx;
    const bottom =
      weights[base + i01] + (weights[base + i11] - weights[base + i01]) * tx;
    const value = (top + (bottom - top) * ty) / 255;
    out[c] = value;
    total += value;
  }

  if (total > 1) {
    // Renormalise rather than clip: clipping the total while leaving the
    // per-channel values would let them out-sum the budget the caller hands to
    // the generator, and the splat would stop summing to 1.
    const inv = 1 / total;
    for (let c = 0; c < channels; c++) out[c] *= inv;
    return 1;
  }
  return total;
}

// ── Persistence ──────────────────────────────────────────────────────────────
// Layout (little-endian):
//   u32 version   — PAINT_MASK_VERSION; bump on any layout change
//   u32 size      — texels per side
//   u32 channels  — weight planes
//   u32 step      — LOD-0 samples per texel
//   u32 flags     — bit 0: body is compressed (reserved; readers reject it)
//   u8[size*size*channels] weights, channel-major
//
// `step` and `channels` are stored rather than assumed so the reader can reject
// a mask written against a different resolution or a climate with a different
// biome count, instead of silently misreading it.

export function serializePaintMask(mask: PaintMask): ArrayBuffer {
  const expected = mask.size * mask.size * mask.channels;
  if (mask.weights.length !== expected)
    throw new Error(
      `Paint mask weights length ${mask.weights.length} does not match ${mask.size}² × ${mask.channels}.`
    );

  const buffer = new ArrayBuffer(PAINT_MASK_HEADER_BYTES + expected);
  const view = new DataView(buffer);
  view.setUint32(0, PAINT_MASK_VERSION, true);
  view.setUint32(4, mask.size, true);
  view.setUint32(8, mask.channels, true);
  view.setUint32(12, mask.step, true);
  view.setUint32(16, 0, true); // flags — raw, uncompressed
  new Uint8Array(buffer, PAINT_MASK_HEADER_BYTES).set(mask.weights);
  return buffer;
}

/**
 * Throws on anything malformed or not-yet-supported; callers treat a throw as
 * "no usable mask" and fall back to the unpainted generator result — the same
 * contract as deserializeChunkSnapshot.
 */
export function deserializePaintMask(buffer: ArrayBuffer): PaintMask {
  if (buffer.byteLength < PAINT_MASK_HEADER_BYTES)
    throw new Error('Paint mask is smaller than its header.');

  const view = new DataView(buffer);
  const version = view.getUint32(0, true);
  const size = view.getUint32(4, true);
  const channels = view.getUint32(8, true);
  const step = view.getUint32(12, true);
  const flags = view.getUint32(16, true);

  if (version !== PAINT_MASK_VERSION)
    throw new Error(`Unsupported paint mask version ${version}.`);
  if ((flags & PAINT_MASK_FLAG_COMPRESSED) !== 0)
    throw new Error('Compressed paint masks are not supported yet.');
  if (size <= 0 || channels <= 0 || step <= 0)
    throw new Error(
      `Invalid paint mask dimensions ${size}² × ${channels} @ step ${step}.`
    );

  const expected = size * size * channels;
  if (buffer.byteLength !== PAINT_MASK_HEADER_BYTES + expected)
    throw new Error(
      `Paint mask body is ${
        buffer.byteLength - PAINT_MASK_HEADER_BYTES
      } bytes; expected ${expected}.`
    );

  return {
    size,
    step,
    channels,
    weights: new Uint8Array(buffer, PAINT_MASK_HEADER_BYTES, expected),
  };
}

/**
 * Async lookup for a chunk's saved paint mask, injected into the
 * TerrainRenderer by the host app (the renderer package cannot depend on the
 * app's asset store). Resolves null when the chunk has never been painted —
 * the same contract as ChunkSnapshotProvider.
 */
export type PaintMaskProvider = (
  cx: number,
  cy: number
) => Promise<PaintMask | null>;

// ── Brush ────────────────────────────────────────────────────────────────────

export type PaintBrushType = 'paint' | 'erase';

export interface PaintStamp {
  type: PaintBrushType;
  /** Channel to paint. Ignored by `erase`, which lifts every channel. */
  channel: number;
  /**
   * A channel this stroke lifts back toward zero as it paints, at the same
   * rate. Ignored by `erase` (which already lifts everything) and when it names
   * the painted channel itself.
   *
   * For masks where one channel negates the others: scatter's exclusion channel
   * suppresses every layer, so without this, painting into a cleared area does
   * nothing and the author has to erase first with a different tool. Asymmetric
   * on purpose — painting the exclusion channel does *not* lift the layers, so
   * clearing a site and later lifting the clearing brings back what was there.
   */
  release?: number;
  /** Brush centre in world coordinates. */
  centerX: number;
  centerZ: number;
  /** Brush radius in world units. */
  radius: number;
  /**
   * Blend fraction (0..1) applied at the brush centre, already scaled by the
   * caller (e.g. by elapsed time). Each stamp eases the painted weight toward
   * full (or, erasing, toward zero) by this fraction of what remains, so a held
   * brush approaches saturation instead of stepping to it.
   */
  amount: number;
}

/**
 * Supplies per-chunk masks to a stamp. `getMask` returns the chunk's mutable
 * mask — edits are written back into the same array — or null when the chunk
 * cannot be painted right now (not loaded, or its saved mask is still being
 * read); such chunks are skipped, exactly as unresolved heights are in
 * applySculptStamp.
 */
export interface PaintMaskSource {
  /** LOD-0 samples per chunk side (e.g. 241). */
  chunkSize: number;
  /** World units per LOD-0 sample step (TERRAIN_METERS_PER_SAMPLE). */
  metersPerSample: number;
  /** LOD-0 samples per mask texel; every mask this source returns uses it. */
  step: number;
  /** Weight planes per mask; every mask this source returns carries them all. */
  channels: number;
  /**
   * The channels are unrelated quantities, so painting one leaves the rest
   * alone. Biome channels are the opposite — a texel is a choice between
   * biomes, and painting one has to squeeze the others into the budget it
   * leaves so the generator keeps a well-defined remainder — which is the
   * default. A scatter mask sets this: two layer slots at full density means
   * grass under trees, not a contradiction.
   */
  independentChannels?: boolean;
  getMask(cx: number, cy: number): PaintMask | null;
}

export interface TouchedMaskChunk {
  cx: number;
  cy: number;
  mask: PaintMask;
}

// Smoothstep falloff: 1 at the brush centre, 0 at the radius — the same curve
// the sculpt brush uses, so the two tools feel like one brush.
function falloff(dist: number, radius: number): number {
  const t = dist / radius;
  return 1 - t * t * (3 - 2 * t);
}

// A u8 step that always moves when the float target says it should. Without
// this the asymptotic ease (`w += d * (1 - w)`) rounds to the same byte near
// saturation and the brush visibly stalls a few percent short of full.
function quantise(current: number, target: number): number {
  let next = Math.round(target * 255);
  if (next === current) {
    if (target * 255 > current + 1e-6) next = current + 1;
    else if (target * 255 < current - 1e-6) next = current - 1;
  }
  return next < 0 ? 0 : next > 255 ? 255 : next;
}

/**
 * Applies one brush stamp to every chunk the brush overlaps and returns the
 * chunks whose masks changed.
 *
 * Structurally the same world-space pass as applySculptStamp — work in a grid
 * space where a chunk spans a fixed integer, find the texels inside the brush,
 * and scatter each result to *every* chunk that owns it — but over mask texels
 * rather than height samples. That scatter is the whole reason painted borders
 * stay seam-free: a texel on a chunk edge belongs to two chunks (four at a
 * corner) and both copies must be written with the identical byte, or the
 * bilinear splat sampling on either side disagrees at the join.
 *
 * Pure with respect to its inputs: all mask access goes through `source`.
 */
export function applyPaintStamp(
  source: PaintMaskSource,
  stamp: PaintStamp
): TouchedMaskChunk[] {
  const { chunkSize, metersPerSample, step } = source;
  // Chunk span in mask texels, and the half-span that centres it on the chunk.
  const span = (chunkSize - 1) / step;
  const half = span / 2;

  if (stamp.amount <= 0 || stamp.radius <= 0) return [];

  // Into mask-texel space: one unit is `step` samples is `step * metersPerSample`
  // world units. Everything below is integer texel math, independent of scale.
  const unit = metersPerSample * step;
  const centerX = stamp.centerX / unit;
  const centerZ = stamp.centerZ / unit;
  const radius = stamp.radius / unit;

  const x0 = Math.ceil(centerX - radius);
  const x1 = Math.floor(centerX + radius);
  const z0 = Math.ceil(centerZ - radius);
  const z1 = Math.floor(centerZ + radius);
  if (x1 < x0 || z1 < z0) return [];

  const maskCache = new Map<string, PaintMask | null>();
  const resolve = (cx: number, cy: number): PaintMask | null => {
    const key = `${cx},${cy}`;
    let mask = maskCache.get(key);
    if (mask === undefined) {
      mask = source.getMask(cx, cy);
      maskCache.set(key, mask);
    }
    return mask;
  };

  const touched = new Map<string, TouchedMaskChunk>();
  const radiusSq = radius * radius;
  const erasing = stamp.type === 'erase';
  const independent = source.independentChannels === true;
  const channels = source.channels;
  const ch = stamp.channel;
  if (!erasing && (ch < 0 || ch >= channels)) return [];
  const release =
    stamp.release !== undefined && stamp.release !== ch ? stamp.release : -1;

  // The texel's new weights, computed once per texel and then written to every
  // owning chunk. Hoisted so the texel loop allocates nothing.
  const next = new Uint8Array(channels);

  for (let wz = z0; wz <= z1; wz++) {
    const cyMin = Math.ceil((wz - half) / span);
    const cyMax = Math.floor((wz + half) / span);

    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - centerX;
      const dz = wz - centerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;

      const cxMin = Math.ceil((wx - half) / span);
      const cxMax = Math.floor((wx + half) / span);

      // A texel is paintable only when EVERY chunk that owns it resolved —
      // writing one side of a shared edge while the other owner is unavailable
      // would persist exactly the seam the scatter exists to prevent.
      let owners = 0;
      let resolved = 0;
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          owners++;
          if (resolve(cx, cy)) resolved++;
        }
      }
      if (owners === 0 || resolved !== owners) continue;

      const d = Math.min(1, stamp.amount * falloff(Math.sqrt(distSq), radius));
      if (d <= 0) continue;

      // Read from any owner — their copies of a shared texel are identical by
      // construction, which is precisely what the scatter below maintains.
      const first = resolve(cxMin, cyMin)!;
      const firstSize = first.size;
      const firstTexel =
        (cyMin * span + half - wz) * firstSize + (wx - cxMin * span + half);
      const firstPlane = firstSize * firstSize;

      let changed = false;
      if (erasing) {
        // Lift every channel toward zero, revealing the generator beneath.
        for (let c = 0; c < channels; c++) {
          const cur = first.weights[c * firstPlane + firstTexel];
          const value = cur === 0 ? 0 : quantise(cur, (cur / 255) * (1 - d));
          next[c] = value;
          if (value !== cur) changed = true;
        }
      } else {
        const cur = first.weights[ch * firstPlane + firstTexel];
        const norm = cur / 255;
        const painted = quantise(cur, norm + d * (1 - norm));
        if (painted !== cur) changed = true;

        // Squeeze the other channels into whatever budget the painted channel
        // leaves, so the stored weights never out-sum 1 and the generator
        // always keeps a well-defined remainder. Independent channels have no
        // shared budget to keep, so they are carried through untouched.
        const rest = 255 - painted;
        let otherSum = 0;
        if (!independent)
          for (let c = 0; c < channels; c++)
            if (c !== ch)
              otherSum += first.weights[c * firstPlane + firstTexel];
        const scale = otherSum > rest ? rest / otherSum : 1;

        for (let c = 0; c < channels; c++) {
          if (c === ch) {
            next[c] = painted;
            continue;
          }
          const w = first.weights[c * firstPlane + firstTexel];
          let value = scale === 1 ? w : Math.round(w * scale);
          if (c === release && value !== 0)
            value = quantise(value, (value / 255) * (1 - d));
          next[c] = value;
          if (value !== w) changed = true;
        }
      }

      if (!changed) continue;

      // Scatter to every chunk that owns this texel so shared edge texels stay
      // byte-identical across the border.
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const mask = resolve(cx, cy)!;
          const size = mask.size;
          const plane = size * size;
          const texel =
            (cy * span + half - wz) * size + (wx - cx * span + half);
          for (let c = 0; c < channels; c++)
            mask.weights[c * plane + texel] = next[c];

          const key = `${cx},${cy}`;
          if (!touched.has(key)) touched.set(key, { cx, cy, mask });
        }
      }
    }
  }

  return [...touched.values()];
}
