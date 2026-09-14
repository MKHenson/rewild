import { Vector2 } from 'rewild-common';
import { ClimateConfig, getClimateScatterLayers } from './Biomes';
import {
  createBiomeResolver,
  createClimateField,
  createScatterNoiseFields,
  resolveActiveBiomes,
  sampleLayerNoise,
} from './ClimateField';
import { resolveScatterDensity } from './LayerWeights';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import {
  PaintMask,
  isPaintMaskChannelEmpty,
  samplePaintMaskChannel,
} from './PaintMask';
import {
  getScatterLayer,
  getScatterLayerOrder,
  getScatterLayerSlot,
  scatterExcludeChannel,
  scatterMaskChannels,
} from './ScatterLayers';
import {
  SCATTER_KILL_CELL_LIMIT,
  ScatterKillSet,
  scatterKillKey,
} from './ScatterKillSet';
import { heightGradientAt, slopeDegreesAt } from './Splat';

// Per-chunk scatter placement: which instances of which layer stand where.
//
// Placement is a jittered grid in *global sample space* — the same coordinate
// the chunk offset is expressed in — so a cell belongs to one world position
// regardless of which chunk resolves it, and adjacent chunks agree on their
// shared border with no cross-chunk state. Nothing here is stored: the same
// (seed, offset, heights, climate) always produces the same instances, which is
// what lets an unedited chunk cost nothing to save.
//
// One candidate per cell, accepted against the density the biome rules resolve
// at its position. Cell size is twice the layer's footprint, so density 1 is as
// tightly packed as the footprint allows. Two neighbours jittered toward their
// shared edge can still land closer than a footprint apart — this is a jittered
// grid, not a Poisson disc, and the difference does not read at scatter density.

// Floats per instance in `ScatterInstances.data`:
//   0..2  position, chunk-local metres (the mesh's own space)
//   3..6  rotation quaternion, xyzw
//   7     uniform scale
//   8     wind phase, 0..1
export const SCATTER_INSTANCE_STRIDE = 9;

const INITIAL_CAPACITY = 256;
const DEG_TO_RAD = Math.PI / 180;

export interface ScatterInstances {
  /** Layer name, and its slot in the library (a paint mask channel). */
  layer: string;
  slot: number;
  count: number;
  /** `count * SCATTER_INSTANCE_STRIDE` floats; may be longer than that. */
  data: Float32Array;
  /**
   * Each instance's kill key (see ScatterKillSet), present only when the caller
   * asked for it. Off by default: the draw path never needs an identity, and
   * every chunk would otherwise post four more bytes per instance across the
   * worker boundary for nobody.
   */
  ids?: Uint32Array;
}

export interface ScatterChunkOptions {
  /** Painted biome weights, as generateSplatMap takes them — a painted biome
   *  grows its own scatter. */
  biomeMask?: PaintMask | null;
  /** Painted scatter density: one channel per layer slot plus the exclusion
   *  channel (see scatterMaskChannels). Overrides the *input* to placement —
   *  the density a candidate is accepted against — so painted instances are
   *  derived like every other one and track a sculpt, a re-tuned jitter range
   *  and a seed change for free. */
  scatterMask?: PaintMask | null;
  /** Instances the author has plucked, skipped wherever they would be placed. */
  killSet?: ScatterKillSet | null;
  /**
   * Restricts placement to the cells overlapping this chunk-local sample-space
   * box, instead of the whole chunk. For the editor's pick, which needs the
   * handful of candidates around a click rather than the thousands a chunk
   * grows; the instances it returns are identical to the full run's.
   */
  region?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Fill `ScatterInstances.ids`. */
  withIds?: boolean;
}

/**
 * The density a candidate is accepted against, from the two sources composited.
 */
function compositeDensity(
  biome: number,
  painted: number,
  exclude: number
): number {
  return (biome + painted * (1 - biome)) * (1 - exclude);
}

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// A cell's hash, from its global cell coordinates rather than anything chunk-
// local — the whole basis of the seam-freeness above.
function cellHash(
  cellX: number,
  cellY: number,
  slot: number,
  seed: number
): number {
  let h = Math.imul(cellX | 0, 0x9e3779b1);
  h = Math.imul(h ^ (cellY | 0), 0x85ebca6b);
  h = Math.imul(h ^ (slot | 0), 0xc2b2ae35);
  return mix(h ^ (seed | 0));
}

/** The `index`-th independent 0..1 value derived from a cell hash. */
function hash01(hash: number, index: number): number {
  return mix(hash + Math.imul(index | 0, 0x9e3779b1)) / 4294967296;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

// Bilinear, because a candidate lands between samples and snapping it to the
// nearest would step scatter down the heightfield's grid.
function sampleHeight(
  heights: Float32Array,
  size: number,
  x: number,
  y: number
): number {
  const x0 = Math.min(size - 1, Math.max(0, Math.floor(x)));
  const y0 = Math.min(size - 1, Math.max(0, Math.floor(y)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const h00 = heights[y0 * size + x0];
  const h10 = heights[y0 * size + x1];
  const h01 = heights[y1 * size + x0];
  const h11 = heights[y1 * size + x1];

  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), ty);
}

// Scratch — this module is called once per chunk and everything below runs per
// candidate, so nothing here may be allocated inside the loops.
const _gradient = new Float64Array(2);
const _normal = new Float64Array(3);
const _quaternion = new Float64Array(4);
const _tilt = new Float64Array(4);
const _product = new Float64Array(4);

// Surface normal from the height gradient. The sample grid runs +y into -z (see
// generateTerrainMesh), which is why dh/dy enters positively.
function surfaceNormal(
  heights: Float32Array,
  size: number,
  x: number,
  y: number,
  out: Float64Array
): void {
  const sx = Math.min(size - 1, Math.max(0, Math.round(x)));
  const sy = Math.min(size - 1, Math.max(0, Math.round(y)));
  heightGradientAt(heights, size, size, sx, sy, _gradient);

  const nx = -_gradient[0];
  const nz = _gradient[1];
  const length = Math.sqrt(nx * nx + 1 + nz * nz);
  out[0] = nx / length;
  out[1] = 1 / length;
  out[2] = nz / length;
}

function quaternionMultiply(
  a: Float64Array,
  b: Float64Array,
  out: Float64Array
): void {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];

  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
}

// The rotation taking world up onto `normal`, slerped out from identity by
// `align`. Matches quaternionFromUpToNormal in ConformedPlacement, so a
// scattered rock and a hand-placed one lie on a slope the same way.
function alignmentQuaternion(
  normal: Float64Array,
  align: number,
  out: Float64Array
): void {
  const dot = normal[1];
  if (dot > 0.9999 || align <= 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return;
  }

  // Any axis in the plane will do for an antiparallel normal; a half turn about
  // z is the same choice ConformedPlacement makes.
  let axisX: number;
  let axisZ: number;
  let angle: number;
  if (dot < -0.9999) {
    axisX = 0;
    axisZ = 1;
    angle = Math.PI;
  } else {
    // up × normal, which for up = (0,1,0) is (normal.z, 0, -normal.x).
    axisX = normal[2];
    axisZ = -normal[0];
    const length = Math.sqrt(axisX * axisX + axisZ * axisZ);
    axisX /= length;
    axisZ /= length;
    angle = Math.acos(dot);
  }

  const half = angle * align * 0.5;
  const s = Math.sin(half);
  out[0] = axisX * s;
  out[1] = 0;
  out[2] = axisZ * s;
  out[3] = Math.cos(half);
}

function grow(
  data: Float32Array<ArrayBuffer>,
  needed: number
): Float32Array<ArrayBuffer> {
  let capacity = data.length;
  while (capacity < needed) capacity *= 2;
  const grown = new Float32Array(capacity);
  grown.set(data);
  return grown;
}

/**
 * Every scatter instance a chunk carries, grouped by layer.
 *
 * `offset` is the chunk's sample-space origin (`coord * (chunkSize - 1)`), the
 * same value generateSplatMap takes — heights, climate and scatter all read one
 * coordinate system, so a boulder lands on the rock its splat map painted.
 *
 * Instance positions are chunk-local metres, matching the mesh, so they ride
 * the chunk transform rather than needing a rebuild when the chunk moves.
 */
export function scatterChunk(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  heights: Float32Array,
  options?: ScatterChunkOptions
): ScatterInstances[] {
  if (heights.length !== chunkSize * chunkSize)
    throw new Error(
      `Scatter needs ${chunkSize * chunkSize} heights, got ${heights.length}.`
    );

  const climateLayers = new Set(getClimateScatterLayers(climate));

  // Every layer in the library is paintable anywhere, so the set to place is
  // what the climate grows plus whatever has been painted here — a layer the
  // local biome never emits is the ordinary case with a biome density of zero.
  const mask =
    options?.scatterMask &&
    options.scatterMask.channels === scatterMaskChannels()
      ? options.scatterMask
      : null;
  const excludeChannel = scatterExcludeChannel();
  const killSet = options?.killSet ?? null;
  const region = options?.region ?? null;
  const withIds = options?.withIds === true;
  const layerNames = mask
    ? getScatterLayerOrder().filter(
        (name, slot) =>
          climateLayers.has(name) || !isPaintMaskChannelEmpty(mask, slot)
      )
    : [...climateLayers];
  if (layerNames.length === 0) return [];

  const field = createClimateField(chunkSize, chunkSize, seed, offset, climate);
  const resolver = createBiomeResolver(field, options?.biomeMask ?? null);
  const noiseFields = createScatterNoiseFields(seed, offset, climate);

  // The chunk's half-open span in global sample space. Half-open so a candidate
  // landing exactly on a shared edge belongs to one chunk, not both.
  const spanStart = offset.x;
  const spanEndX = offset.x + chunkSize - 1;
  const spanStartY = offset.y;
  const spanEndY = offset.y + chunkSize - 1;
  const half = (chunkSize - 1) / 2;

  const results: ScatterInstances[] = [];

  for (const name of layerNames) {
    const layer = getScatterLayer(name);
    const jitter = layer.jitter;
    const yawFrom = jitter.yaw ? jitter.yaw.from : 0;
    const yawTo = jitter.yaw ? jitter.yaw.to : 360;
    const tiltRange = jitter.tilt ?? 0;
    const align = Math.min(1, Math.max(0, layer.alignToNormal ?? 0));
    const yOffset = layer.yOffset ?? 0;
    const slot = getScatterLayerSlot(name);

    // Cell size in sample units, from a footprint authored in metres.
    const cellSize = (2 * layer.footprint) / TERRAIN_METERS_PER_SAMPLE;

    // A kill key addresses a cell within its chunk, so a footprint fine enough
    // to out-count that would leave instances no author could pluck. Checked
    // here because the bound depends on the chunk size, which the layer table
    // does not know.
    if ((chunkSize - 1) / cellSize >= SCATTER_KILL_CELL_LIMIT)
      throw new Error(
        `Scatter layer '${name}' footprint ${layer.footprint}m puts more than ${SCATTER_KILL_CELL_LIMIT} cells across a ${chunkSize}-sample chunk.`
      );

    // Which of each biome's rules grows this layer, resolved up front so the
    // candidate loop never searches. -1 where a biome does not grow it, and
    // `hasRule` false for a purely painted layer — which skips the biome
    // resolve per candidate, since every rule would miss anyway.
    const ruleIndex = new Int32Array(climate.biomes.length).fill(-1);
    let hasRule = false;
    for (let b = 0; b < climate.biomes.length; b++) {
      const rules = climate.biomes[b].scatter ?? [];
      for (let r = 0; r < rules.length; r++)
        if (rules[r].layer === name) {
          ruleIndex[b] = r;
          hasRule = true;
        }
    }

    let data = new Float32Array(INITIAL_CAPACITY * SCATTER_INSTANCE_STRIDE);
    let ids = withIds ? new Uint32Array(INITIAL_CAPACITY) : null;
    let count = 0;

    // The chunk's own cell origin. Kill keys are relative to it, so a chunk's
    // blob says the same thing wherever in the world the chunk sits.
    const cellX0 = Math.floor(spanStart / cellSize);
    const cellX1 = Math.floor(spanEndX / cellSize);
    const cellY0 = Math.floor(spanStartY / cellSize);
    const cellY1 = Math.floor(spanEndY / cellSize);

    // A region clips the sweep to the cells that can reach it; the cells
    // themselves are unchanged, so a clipped run places exactly what the full
    // run would have inside the box.
    const fromY = region
      ? Math.max(cellY0, Math.floor((spanStartY + region.y0) / cellSize))
      : cellY0;
    const toY = region
      ? Math.min(cellY1, Math.floor((spanStartY + region.y1) / cellSize))
      : cellY1;
    const fromX = region
      ? Math.max(cellX0, Math.floor((spanStart + region.x0) / cellSize))
      : cellX0;
    const toX = region
      ? Math.min(cellX1, Math.floor((spanStart + region.x1) / cellSize))
      : cellX1;

    for (let cellY = fromY; cellY <= toY; cellY++) {
      for (let cellX = fromX; cellX <= toX; cellX++) {
        // Plucked instances are dropped before any of the work below: the cell
        // still exists, it just grows nothing.
        const killKey = killSet
          ? scatterKillKey(slot, cellX - cellX0, cellY - cellY0)
          : -1;
        if (killKey >= 0 && killSet!.has(killKey)) continue;

        const hash = cellHash(cellX, cellY, slot, seed);

        const globalX = (cellX + hash01(hash, 0)) * cellSize;
        const globalY = (cellY + hash01(hash, 1)) * cellSize;
        if (globalX < spanStart || globalX >= spanEndX) continue;
        if (globalY < spanStartY || globalY >= spanEndY) continue;

        const sx = globalX - spanStart;
        const sy = globalY - spanStartY;

        const worldHeight = sampleHeight(heights, chunkSize, sx, sy);
        const slope = slopeDegreesAt(
          heights,
          chunkSize,
          chunkSize,
          Math.min(chunkSize - 1, Math.round(sx)),
          Math.min(chunkSize - 1, Math.round(sy))
        );

        // Density is the biome-weighted sum of whatever rules grow this layer
        // here, so a climate transition fades scatter in rather than switching
        // it on at the border.
        const activeCount = hasRule ? resolveActiveBiomes(resolver, sx, sy) : 0;
        let density = 0;
        for (let b = 0; b < activeCount; b++) {
          const biomeIndex = resolver.biomes[b];
          const rule = ruleIndex[biomeIndex];
          if (rule < 0) continue;

          const noiseField = noiseFields[biomeIndex][rule];
          const noiseValue = noiseField
            ? sampleLayerNoise(
                field.perlin,
                noiseField,
                field.halfWidth,
                field.halfHeight,
                sx,
                sy
              )
            : 0;

          density +=
            resolver.weights[b] *
            resolveScatterDensity(
              climate.biomes[biomeIndex].scatter![rule],
              worldHeight,
              slope,
              noiseValue
            );
        }

        if (mask)
          density = compositeDensity(
            density,
            samplePaintMaskChannel(mask, slot, sx, sy),
            samplePaintMaskChannel(mask, excludeChannel, sx, sy)
          );

        if (density <= 0 || hash01(hash, 2) >= density) continue;

        const scale = lerp(jitter.scale.from, jitter.scale.to, hash01(hash, 3));
        const yaw = lerp(yawFrom, yawTo, hash01(hash, 4)) * DEG_TO_RAD;

        // Yaw about world up, leaned by the tilt jitter, then laid onto the
        // slope — alignment premultiplies so it happens in world space and the
        // yaw survives it, the same order ConformedPlacement uses.
        const halfYaw = yaw * 0.5;
        _quaternion[0] = 0;
        _quaternion[1] = Math.sin(halfYaw);
        _quaternion[2] = 0;
        _quaternion[3] = Math.cos(halfYaw);

        if (tiltRange > 0) {
          const lean = hash01(hash, 5) * tiltRange * DEG_TO_RAD;
          const azimuth = hash01(hash, 6) * Math.PI * 2;
          const s = Math.sin(lean * 0.5);
          _tilt[0] = Math.cos(azimuth) * s;
          _tilt[1] = 0;
          _tilt[2] = Math.sin(azimuth) * s;
          _tilt[3] = Math.cos(lean * 0.5);
          quaternionMultiply(_tilt, _quaternion, _product);
          _quaternion.set(_product);
        }

        if (align > 0) {
          surfaceNormal(heights, chunkSize, sx, sy, _normal);
          alignmentQuaternion(_normal, align, _tilt);
          quaternionMultiply(_tilt, _quaternion, _product);
          _quaternion.set(_product);
        }

        const needed = (count + 1) * SCATTER_INSTANCE_STRIDE;
        if (needed > data.length) data = grow(data, needed);
        if (ids && count >= ids.length) {
          const grown = new Uint32Array(ids.length * 2);
          grown.set(ids);
          ids = grown;
        }
        if (ids)
          ids[count] = scatterKillKey(slot, cellX - cellX0, cellY - cellY0);

        const base = count * SCATTER_INSTANCE_STRIDE;
        data[base] = (sx - half) * TERRAIN_METERS_PER_SAMPLE;
        data[base + 1] = worldHeight + yOffset;
        data[base + 2] = (half - sy) * TERRAIN_METERS_PER_SAMPLE;
        data[base + 3] = _quaternion[0];
        data[base + 4] = _quaternion[1];
        data[base + 5] = _quaternion[2];
        data[base + 6] = _quaternion[3];
        data[base + 7] = scale;
        data[base + 8] = hash01(hash, 7);
        count++;
      }
    }

    if (count > 0)
      results.push({
        layer: name,
        slot,
        count,
        data,
        ids: ids ?? undefined,
      });
  }

  return results;
}

export interface ScatterPick {
  layer: string;
  slot: number;
  /** The kill key to add to the chunk's set to remove this instance. */
  key: number;
  /** Chunk-local metres, the same space the instance is drawn in. */
  x: number;
  y: number;
  z: number;
  /** Horizontal metres from the query point. */
  distance: number;
}

/**
 * The scatter instance nearest a chunk-local point, within `radius` metres
 * horizontally, or null when there is none.
 *
 * Derived rather than looked up: it re-places the handful of cells around the
 * point through scatterChunk itself, so the answer is by construction the same
 * instance that is drawn — no index to keep in step, and no per-instance table
 * held in memory for a tool that is used a few times a session. A dense layer
 * puts tens of thousands of instances in a chunk, and keeping even their
 * positions resident for every loaded chunk would cost more than the whole
 * kill-set feature saves.
 *
 * Horizontal distance because the author is pointing at the ground: the ray
 * hits the terrain, and the instance standing on it is what they mean.
 */
export function pickScatterInstance(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  heights: Float32Array,
  localX: number,
  localZ: number,
  radius: number,
  options?: ScatterChunkOptions
): ScatterPick | null {
  const half = ((chunkSize - 1) / 2) * TERRAIN_METERS_PER_SAMPLE;
  // Chunk-local metres to sample space, the box clipped to the chunk. +z is
  // -sy, the same convention the mesh and the heightfield use.
  const toSampleX = (metres: number) =>
    (metres + half) / TERRAIN_METERS_PER_SAMPLE;
  const toSampleY = (metres: number) =>
    (half - metres) / TERRAIN_METERS_PER_SAMPLE;

  const max = chunkSize - 1;
  const clamp = (v: number) => (v < 0 ? 0 : v > max ? max : v);
  const region = {
    x0: clamp(toSampleX(localX - radius)),
    x1: clamp(toSampleX(localX + radius)),
    // The z flip swaps which edge is the low row.
    y0: clamp(toSampleY(localZ + radius)),
    y1: clamp(toSampleY(localZ - radius)),
  };

  const results = scatterChunk(chunkSize, seed, offset, climate, heights, {
    ...options,
    region,
    withIds: true,
  });

  let best: ScatterPick | null = null;
  let bestDistSq = radius * radius;

  for (const instances of results) {
    const { data, ids, count } = instances;
    if (!ids) continue;

    for (let i = 0; i < count; i++) {
      const base = i * SCATTER_INSTANCE_STRIDE;
      const dx = data[base] - localX;
      const dz = data[base + 2] - localZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > bestDistSq) continue;

      bestDistSq = distSq;
      best = {
        layer: instances.layer,
        slot: instances.slot,
        key: ids[i],
        x: data[base],
        y: data[base + 1],
        z: data[base + 2],
        distance: Math.sqrt(distSq),
      };
    }
  }

  return best;
}
