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
import { PaintMask } from './PaintMask';
import { getScatterLayer, getScatterLayerSlot } from './ScatterLayers';
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
}

export interface ScatterChunkOptions {
  /** Painted biome weights, as generateSplatMap takes them — a painted biome
   *  grows its own scatter. */
  biomeMask?: PaintMask | null;
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

  const layerNames = getClimateScatterLayers(climate);
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

    // Which of each biome's rules grows this layer, resolved up front so the
    // candidate loop never searches. -1 where a biome does not grow it.
    const ruleIndex = new Int32Array(climate.biomes.length).fill(-1);
    for (let b = 0; b < climate.biomes.length; b++) {
      const rules = climate.biomes[b].scatter ?? [];
      for (let r = 0; r < rules.length; r++)
        if (rules[r].layer === name) ruleIndex[b] = r;
    }

    let data = new Float32Array(INITIAL_CAPACITY * SCATTER_INSTANCE_STRIDE);
    let count = 0;

    const cellX0 = Math.floor(spanStart / cellSize);
    const cellX1 = Math.floor(spanEndX / cellSize);
    const cellY0 = Math.floor(spanStartY / cellSize);
    const cellY1 = Math.floor(spanEndY / cellSize);

    for (let cellY = cellY0; cellY <= cellY1; cellY++) {
      for (let cellX = cellX0; cellX <= cellX1; cellX++) {
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
        const activeCount = resolveActiveBiomes(resolver, sx, sy);
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

    if (count > 0) results.push({ layer: name, slot, count, data });
  }

  return results;
}
