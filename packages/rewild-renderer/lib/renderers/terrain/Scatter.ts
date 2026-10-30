import { Vector2 } from 'rewild-common';
import { ScatterRequestData } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { ClimateConfig } from './Biomes';
import { waterEditData } from './Lakes';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { PaintMask } from './PaintMask';
import { getScatterLayerOrder } from './ScatterLayers';
import { ScatterKillSet } from './ScatterKillSet';
import { terrainGenerator } from './TerrainGenerator';
import type { WaterEdit } from './WaterEdit';

// Per-chunk scatter placement: which instances of which layer stand where.
// Placed in Rust (crates/terrain/src/scatter.rs).
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
  /** World height of the sea, which beaches and lakes are measured from. */
  seaLevel?: number;
  /** The chunk's authored water, blended over the generated. */
  waterEdit?: WaterEdit | null;
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
  const request = new ScatterRequestData();
  const biomeMask = options?.biomeMask;
  if (biomeMask)
    request.setBiomeMask(biomeMask.weights, biomeMask.size, biomeMask.step);
  const scatterMask = options?.scatterMask;
  if (scatterMask)
    request.setDensityMask(
      scatterMask.weights,
      scatterMask.size,
      scatterMask.step
    );
  if (options?.killSet?.size)
    request.setKills(Uint32Array.from(options.killSet));
  const region = options?.region;
  if (region) request.setRegion(region.x0, region.y0, region.x1, region.y1);
  request.setWithIds(options?.withIds === true);
  const edit = waterEditData(options?.waterEdit ?? null);
  if (edit) request.setWaterEdit(edit);

  const built = terrainGenerator(seed, climate, options?.seaLevel ?? 0).scatter(
    heights,
    chunkSize,
    offset.x,
    offset.y,
    request
  );
  const order = getScatterLayerOrder();
  const results: ScatterInstances[] = [];
  for (let i = 0; i < built.layerCount; i++) {
    const slot = built.slot(i);
    const ids = built.takeIds(i);
    results.push({
      layer: order[slot],
      slot,
      count: built.count(i),
      data: built.takeData(i),
      ids: options?.withIds ? ids : undefined,
    });
  }
  built.free();
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
