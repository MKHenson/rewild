import {
  BIOME_MASK_STEP,
  PaintMask,
  createPaintMask,
  deserializePaintMask,
  isPaintMaskChannelEmpty,
  paintMaskSize,
  serializePaintMask,
} from './PaintMask';
import type { WaterBody } from './Lakes';
import type { ResolvedWater } from './WaterMap';
import { MAX_WATER_TYPES } from './Water';

// A chunk's authored water, blended over what the generator makes.
//
// A PaintMask at the water map's resolution carries the u8 planes: how much of
// each texel the edit owns (its authority), the edit's coverage, and its type
// weights. Beside it, a float level per texel and the body that owns it. The
// generated water keeps what the authority leaves, so lowering the authority
// back to zero reverts to the generator, and an edit can remove water (coverage
// 0 with full authority) as well as add it.
//
// Saved as one blob per chunk beside the height snapshot, so one capture of a
// chunk's heights and its water edit restores the terrain, the level and the
// coverage together.

export const WATER_EDIT_VERSION = 1;
const WATER_EDIT_HEADER_BYTES = 8;

/** LOD-0 samples per texel: the water map's. */
export const WATER_EDIT_STEP = BIOME_MASK_STEP;

export const WATER_EDIT_AUTHORITY = 0;
export const WATER_EDIT_COVERAGE = 1;
/** First of MAX_WATER_TYPES type weight planes. */
export const WATER_EDIT_TYPES = 2;
export const WATER_EDIT_CHANNELS = WATER_EDIT_TYPES + MAX_WATER_TYPES;

export interface WaterEdit {
  mask: PaintMask;
  /** World height of the edit's surface, per texel. Read where it has
   *  authority. */
  level: Float32Array;
  /** The body the edit's water belongs to, per texel. */
  bodyIds: Uint32Array;
}

export function createWaterEdit(chunkSize: number): WaterEdit {
  const mask = createPaintMask(chunkSize, WATER_EDIT_CHANNELS, WATER_EDIT_STEP);
  const texels = mask.size * mask.size;
  return {
    mask,
    level: new Float32Array(texels),
    bodyIds: new Uint32Array(texels),
  };
}

/** True when the edit owns no texel, so the chunk's water is all generated. */
export function isWaterEditEmpty(edit: WaterEdit): boolean {
  return isPaintMaskChannelEmpty(edit.mask, WATER_EDIT_AUTHORITY);
}

/** Whether `edit` fits a chunk of `chunkSize` samples. */
export function isWaterEditValid(edit: WaterEdit, chunkSize: number): boolean {
  const { mask } = edit;
  const texels = mask.size * mask.size;
  return (
    mask.step === WATER_EDIT_STEP &&
    mask.channels === WATER_EDIT_CHANNELS &&
    mask.size === paintMaskSize(chunkSize, WATER_EDIT_STEP) &&
    edit.level.length === texels &&
    edit.bodyIds.length === texels
  );
}

export function cloneWaterEdit(edit: WaterEdit): WaterEdit {
  return {
    mask: { ...edit.mask, weights: edit.mask.weights.slice() },
    level: edit.level.slice(),
    bodyIds: edit.bodyIds.slice(),
  };
}

/**
 * Layout: u32 version, u32 byte length of the mask, the serialised PaintMask
 * padded to 4 bytes, then the level (f32) and body ID (u32) planes.
 */
export function serializeWaterEdit(edit: WaterEdit): ArrayBuffer {
  const mask = serializePaintMask(edit.mask);
  const maskBytes = mask.byteLength;
  const padded = (maskBytes + 3) & ~3;
  const texels = edit.mask.size * edit.mask.size;
  const buffer = new ArrayBuffer(WATER_EDIT_HEADER_BYTES + padded + texels * 8);
  const view = new DataView(buffer);
  view.setUint32(0, WATER_EDIT_VERSION, true);
  view.setUint32(4, maskBytes, true);
  new Uint8Array(buffer, WATER_EDIT_HEADER_BYTES, maskBytes).set(
    new Uint8Array(mask)
  );
  const planes = WATER_EDIT_HEADER_BYTES + padded;
  new Float32Array(buffer, planes, texels).set(edit.level);
  new Uint32Array(buffer, planes + texels * 4, texels).set(edit.bodyIds);
  return buffer;
}

/** Throws on anything malformed; callers treat a throw as no edit. */
export function deserializeWaterEdit(buffer: ArrayBuffer): WaterEdit {
  if (buffer.byteLength < WATER_EDIT_HEADER_BYTES)
    throw new Error('Water edit is smaller than its header.');
  const view = new DataView(buffer);
  const version = view.getUint32(0, true);
  if (version !== WATER_EDIT_VERSION)
    throw new Error(`Unsupported water edit version ${version}.`);
  const maskBytes = view.getUint32(4, true);
  const padded = (maskBytes + 3) & ~3;
  if (buffer.byteLength < WATER_EDIT_HEADER_BYTES + padded)
    throw new Error('Water edit is smaller than its mask.');

  const mask = deserializePaintMask(
    buffer.slice(WATER_EDIT_HEADER_BYTES, WATER_EDIT_HEADER_BYTES + maskBytes)
  );
  if (mask.channels !== WATER_EDIT_CHANNELS)
    throw new Error(
      `Water edit has ${mask.channels} channels; expected ${WATER_EDIT_CHANNELS}.`
    );
  const texels = mask.size * mask.size;
  const planes = WATER_EDIT_HEADER_BYTES + padded;
  if (buffer.byteLength !== planes + texels * 8)
    throw new Error(
      `Water edit planes are ${buffer.byteLength - planes} bytes; expected ${
        texels * 8
      }.`
    );

  return {
    mask,
    level: new Float32Array(buffer.slice(planes, planes + texels * 4)),
    bodyIds: new Uint32Array(
      buffer.slice(planes + texels * 4, planes + texels * 8)
    ),
  };
}

/**
 * Async lookup for a chunk's saved water edit, injected by the host app.
 * Resolves null when the chunk's water has never been edited.
 */
export type WaterEditProvider = (
  cx: number,
  cy: number
) => Promise<WaterEdit | null>;

/**
 * An id for a body the editor creates, from any integer `seed`. Generated lakes
 * set the top bit (lakeBodyId) and the ocean is 0, so these never collide with
 * either.
 */
export function editedBodyId(seed: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return h & 0x7fffffff || 1;
}

/**
 * The record of a body the editor made, at `level`, from its u8 palette
 * `weights`. Its spill height is its level until the edit rules find its rim.
 */
export function editedBody(
  id: number,
  level: number,
  weights: ArrayLike<number>
): WaterBody {
  const typeWeights = new Array<number>(MAX_WATER_TYPES);
  for (let c = 0; c < MAX_WATER_TYPES; c++)
    typeWeights[c] = (weights[c] ?? 0) / 255;
  return { id, level, spillHeight: level, locked: false, typeWeights };
}

// ── Sampling ─────────────────────────────────────────────────────────────────

/** An edit at one point. Caller-owned scratch for sampleWaterEdit. */
export interface WaterEditSample {
  authority: number;
  coverage: number;
  level: number;
  bodyId: number;
  types: Float64Array;
}

export function createWaterEditSample(): WaterEditSample {
  return {
    authority: 0,
    coverage: 0,
    level: 0,
    bodyId: 0,
    types: new Float64Array(MAX_WATER_TYPES),
  };
}

/**
 * Bilinearly samples `edit` at LOD-0 sample (x, y) into `out`, and returns the
 * authority. The level is weighted by each corner's authority, since a texel
 * the edit does not own has no level; the body is the corner that owns most.
 */
export function sampleWaterEdit(
  edit: WaterEdit,
  x: number,
  y: number,
  out: WaterEditSample
): number {
  const { size, step, weights } = edit.mask;
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
  const tx = Math.min(Math.max(fx - x0, 0), 1);
  const ty = Math.min(Math.max(fy - y0, 0), 1);
  const plane = size * size;

  out.authority = 0;
  out.coverage = 0;
  out.level = 0;
  out.bodyId = 0;
  out.types.fill(0);
  let levelWeight = 0;
  let owner = 0;

  for (let corner = 0; corner < 4; corner++) {
    const cx = corner & 1 ? x1 : x0;
    const cy = corner & 2 ? y1 : y0;
    const w = (corner & 1 ? tx : 1 - tx) * (corner & 2 ? ty : 1 - ty);
    if (w <= 0) continue;
    const t = cy * size + cx;
    const authority = weights[WATER_EDIT_AUTHORITY * plane + t] / 255;
    out.authority += w * authority;
    out.coverage += (w * weights[WATER_EDIT_COVERAGE * plane + t]) / 255;
    for (let c = 0; c < MAX_WATER_TYPES; c++)
      out.types[c] += (w * weights[(WATER_EDIT_TYPES + c) * plane + t]) / 255;
    const owned = w * authority;
    if (owned > 0) {
      out.level += owned * edit.level[t];
      levelWeight += owned;
      if (owned > owner) {
        owner = owned;
        out.bodyId = edit.bodyIds[t];
      }
    }
  }
  if (levelWeight > 0) out.level /= levelWeight;
  return out.authority;
}

/** What the generator resolved at a point, which applyWaterEdit blends into. */
export interface GeneratedWater {
  level: number;
  bodyId: number;
}

/**
 * Blends `edit` at LOD-0 sample (x, y) over the generated water at that point:
 * `coverage`, `water.level`, `water.bodyId` and the palette weights `types`,
 * which it rewrites. Each side counts by its coverage times its share of the
 * authority, so an edit that removes water leaves the level alone. Returns the
 * blended coverage. `scratch` is caller-owned.
 */
export function applyWaterEdit(
  edit: WaterEdit,
  x: number,
  y: number,
  water: GeneratedWater,
  coverage: number,
  types: Float64Array,
  scratch: WaterEditSample
): number {
  const authority = sampleWaterEdit(edit, x, y, scratch);
  if (authority <= 0) return coverage;

  const generated = coverage * (1 - authority);
  const edited = scratch.coverage * authority;
  const total = generated + edited;
  if (total <= 0) {
    types.fill(0);
    return 0;
  }
  if (edited > 0)
    water.level = (generated * water.level + edited * scratch.level) / total;
  for (let c = 0; c < MAX_WATER_TYPES; c++)
    types[c] = (generated * types[c] + edited * scratch.types[c]) / total;
  if (edited >= generated) water.bodyId = scratch.bodyId;
  return total;
}

// ── Stamps ───────────────────────────────────────────────────────────────────

/**
 * `add` raises the edit's coverage and sets its level, body and types. `remove`
 * lowers its coverage, taking authority so the generated water goes too.
 * `reset` lowers the authority, handing the texel back to the generator.
 * `paint` blends the types of the water already there, taking the texel over
 * as it stands (see WaterEditSource.getResolved).
 */
export type WaterStampType = 'add' | 'remove' | 'reset' | 'paint';

export interface WaterStamp {
  type: WaterStampType;
  centerX: number;
  centerZ: number;
  radius: number;
  /** Blend fraction (0..1) at the centre, as PaintStamp.amount. */
  amount: number;
  /** World height of added water. */
  level: number;
  bodyId: number;
  /** Palette weights of added or painted water, summing to 1. */
  typeWeights: ArrayLike<number>;
  /** Texels the stamp leaves alone. */
  guard?: WaterGuard;
}

/** Levels closer than this, in metres, count as one surface. */
export const WATER_LEVEL_MATCH = 0.05;

/**
 * Texels a stroke adding water at one level leaves alone, over world texels
 * i0..i0+width-1, j0..j0+height-1: another body's water at a different level,
 * the texels around it, and texels whose water is not known. Outside the box
 * counts as blocked.
 */
export interface WaterGuard {
  i0: number;
  j0: number;
  width: number;
  height: number;
  blocked: Uint8Array;
}

/**
 * The guard over world texels (i0, j0)–(i1, j1) for water of `bodyId` at
 * `level`. `getWater` gives a chunk's water as it stands, or null while it is
 * not known; `span` is a chunk's width in texels.
 */
export function buildWaterGuard(
  getWater: (cx: number, cy: number) => ResolvedWater | null,
  span: number,
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  bodyId: number,
  level: number
): WaterGuard {
  const width = i1 - i0 + 1;
  const height = j1 - j0 + 1;
  const blocked = new Uint8Array(Math.max(0, width * height));
  const half = span / 2;
  const cache = new Map<string, ResolvedWater | null>();
  for (let j = j0 - 1; j <= j1 + 1; j++) {
    const cy = Math.ceil((j - half) / span);
    for (let i = i0 - 1; i <= i1 + 1; i++) {
      const cx = Math.ceil((i - half) / span);
      const key = `${cx},${cy}`;
      let water = cache.get(key);
      if (water === undefined) {
        water = getWater(cx, cy);
        cache.set(key, water);
      }
      if (water) {
        const t =
          (cy * span + half - j) * water.size + (i - cx * span + half);
        if (
          water.coverage[t] === 0 ||
          water.bodyIds[t] === bodyId ||
          Math.abs(water.levels[t] - level) <= WATER_LEVEL_MATCH
        )
          continue;
      }
      for (let y = Math.max(j0, j - 1); y <= Math.min(j1, j + 1); y++)
        for (let x = Math.max(i0, i - 1); x <= Math.min(i1, i + 1); x++)
          blocked[(y - j0) * width + (x - i0)] = 1;
    }
  }
  return { i0, j0, width, height, blocked };
}

export function isWaterBlocked(guard: WaterGuard, i: number, j: number) {
  const x = i - guard.i0;
  const y = j - guard.j0;
  if (x < 0 || y < 0 || x >= guard.width || y >= guard.height) return true;
  return guard.blocked[y * guard.width + x] !== 0;
}

/**
 * Supplies per-chunk edits to a stamp: the chunk's mutable edit, or null when
 * it cannot be edited now. As PaintMaskSource.
 */
export interface WaterEditSource {
  chunkSize: number;
  metersPerSample: number;
  getEdit(cx: number, cy: number): WaterEdit | null;
  /** The chunk's water as it stands (see resolveWater), which a `paint` stamp
   *  takes over where the edit does not own a texel outright. A chunk without
   *  it is skipped. */
  getResolved?(cx: number, cy: number): ResolvedWater | null;
}

export interface TouchedWaterChunk {
  cx: number;
  cy: number;
  edit: WaterEdit;
}

// 1 at the centre, 0 at the radius: the paint and sculpt brushes' curve.
function falloff(dist: number, radius: number): number {
  const t = dist / radius;
  return 1 - t * t * (3 - 2 * t);
}

// A u8 step that always moves when the float target says it should, so a held
// brush never stalls a step short of its target (see PaintMask's quantise).
function quantise(current: number, target: number): number {
  let next = Math.round(target * 255);
  if (next === current) {
    if (target * 255 > current + 1e-6) next = current + 1;
    else if (target * 255 < current - 1e-6) next = current - 1;
  }
  return next < 0 ? 0 : next > 255 ? 255 : next;
}

/**
 * Applies one stamp to every chunk the brush overlaps and returns the chunks
 * whose edits changed. A texel on a chunk edge belongs to every chunk that
 * owns it, and is written only when all of them resolve, with the same values
 * in each, so edits stay seamless (see applyPaintStamp).
 */
export function applyWaterStamp(
  source: WaterEditSource,
  stamp: WaterStamp
): TouchedWaterChunk[] {
  const { chunkSize, metersPerSample } = source;
  const step = WATER_EDIT_STEP;
  const span = (chunkSize - 1) / step;
  const half = span / 2;
  if (stamp.amount <= 0 || stamp.radius <= 0) return [];

  const unit = metersPerSample * step;
  const centerX = stamp.centerX / unit;
  const centerZ = stamp.centerZ / unit;
  const radius = stamp.radius / unit;
  const x0 = Math.ceil(centerX - radius);
  const x1 = Math.floor(centerX + radius);
  const z0 = Math.ceil(centerZ - radius);
  const z1 = Math.floor(centerZ + radius);
  if (x1 < x0 || z1 < z0) return [];

  const cache = new Map<string, WaterEdit | null>();
  const resolve = (cx: number, cy: number): WaterEdit | null => {
    const key = `${cx},${cy}`;
    let edit = cache.get(key);
    if (edit === undefined) {
      edit = source.getEdit(cx, cy);
      cache.set(key, edit);
    }
    return edit;
  };

  const touched = new Map<string, TouchedWaterChunk>();
  const radiusSq = radius * radius;
  const next = new Uint8Array(WATER_EDIT_CHANNELS);

  for (let wz = z0; wz <= z1; wz++) {
    const cyMin = Math.ceil((wz - half) / span);
    const cyMax = Math.floor((wz + half) / span);
    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - centerX;
      const dz = wz - centerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;
      if (stamp.guard && isWaterBlocked(stamp.guard, wx, wz)) continue;
      const cxMin = Math.ceil((wx - half) / span);
      const cxMax = Math.floor((wx + half) / span);

      let owners = 0;
      let resolved = 0;
      for (let cy = cyMin; cy <= cyMax; cy++)
        for (let cx = cxMin; cx <= cxMax; cx++) {
          owners++;
          if (resolve(cx, cy)) resolved++;
        }
      if (owners === 0 || resolved !== owners) continue;
      let water: ResolvedWater | null = null;
      if (stamp.type === 'paint') {
        water = source.getResolved?.(cxMin, cyMin) ?? null;
        if (!water) continue;
      }

      const d = Math.min(1, stamp.amount * falloff(Math.sqrt(distSq), radius));
      if (d <= 0) continue;

      const first = resolve(cxMin, cyMin)!;
      const size = first.mask.size;
      const plane = size * size;
      const firstTexel =
        (cyMin * span + half - wz) * size + (wx - cxMin * span + half);
      const weights = first.mask.weights;
      for (let c = 0; c < WATER_EDIT_CHANNELS; c++)
        next[c] = weights[c * plane + firstTexel];

      const ownedByte = next[WATER_EDIT_AUTHORITY];
      const coveredByte = next[WATER_EDIT_COVERAGE];
      const authority = ownedByte / 255;
      const coverage = coveredByte / 255;
      let level = first.level[firstTexel];
      let bodyId = first.bodyIds[firstTexel];
      if (stamp.type === 'paint') {
        if (ownedByte < 255) {
          next[WATER_EDIT_AUTHORITY] = 255;
          next[WATER_EDIT_COVERAGE] = water!.coverage[firstTexel];
          for (let c = 0; c < MAX_WATER_TYPES; c++)
            next[WATER_EDIT_TYPES + c] = water!.typeWeights[firstTexel * 4 + c];
          level = water!.levels[firstTexel];
          bodyId = water!.bodyIds[firstTexel];
        }
        if (next[WATER_EDIT_COVERAGE] === 0) continue;
        for (let c = 0; c < MAX_WATER_TYPES; c++) {
          const byte = next[WATER_EDIT_TYPES + c];
          const type = byte / 255;
          next[WATER_EDIT_TYPES + c] = quantise(
            byte,
            type + d * ((stamp.typeWeights[c] ?? 0) - type)
          );
        }
      } else if (stamp.type === 'reset') {
        next[WATER_EDIT_AUTHORITY] = quantise(ownedByte, authority * (1 - d));
      } else {
        next[WATER_EDIT_AUTHORITY] = quantise(
          ownedByte,
          authority + d * (1 - authority)
        );
        if (stamp.type === 'add') {
          next[WATER_EDIT_COVERAGE] = quantise(
            coveredByte,
            coverage + d * (1 - coverage)
          );
          for (let c = 0; c < MAX_WATER_TYPES; c++) {
            const byte = next[WATER_EDIT_TYPES + c];
            const type = byte / 255;
            next[WATER_EDIT_TYPES + c] = quantise(
              byte,
              type + d * ((stamp.typeWeights[c] ?? 0) - type)
            );
          }
          level = stamp.level;
          bodyId = stamp.bodyId;
        } else {
          next[WATER_EDIT_COVERAGE] = quantise(coveredByte, coverage * (1 - d));
        }
      }

      for (let cy = cyMin; cy <= cyMax; cy++)
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const edit = resolve(cx, cy)!;
          const texel =
            (cy * span + half - wz) * size + (wx - cx * span + half);
          for (let c = 0; c < WATER_EDIT_CHANNELS; c++)
            edit.mask.weights[c * plane + texel] = next[c];
          edit.level[texel] = level;
          edit.bodyIds[texel] = bodyId;
          const key = `${cx},${cy}`;
          if (!touched.has(key)) touched.set(key, { cx, cy, edit });
        }
    }
  }
  return [...touched.values()];
}
