// A scatter of small stones in one mesh, the way a patch is several tufts.
//
// Every pebble is its own field, its own six charts and its own block of the
// image. That is the whole difference from a rock, and it is what lets the
// painter run whole: lichen reads off `dot(n, up)`, soil climbs from the
// stone's own base, and wear reads the curvature of `shape`. A skin baked from
// one stone and worn by another lands all of it on the wrong faces, so nothing
// is shared here but the image the blocks sit in.
//
// No pebble is turned or tilted after it is built, for the same reason. Its
// seed already gives it its own scoops, bedding and noise, and a rotation
// applied after the bake would take the weathering's `up` with it.

import { createBuilder, finish, type ForgeMesh } from './mesh.ts';
import type { Params } from './params.ts';
import { baseOf, chartAtlas, pushStone, rockChartPx, rockField, type ChartAtlas, type RockField } from './rock.ts';
import { createRng, type Rng } from './rng.ts';
import type { Vec3 } from './vec.ts';

/** One stone of a cluster. */
export interface Pebble {
  field: RockField;
  /** Where its lowest point rests, in the cluster's space. */
  origin: Vec3;
  /** Half its widest horizontal span, which is what the packing keeps apart. */
  reach: number;
}

/** What the emitted layer and the report are measured off. */
export interface ClusterMetrics {
  /** The tallest pebble's crown above the ground plane. */
  height: number;
  /** Metres from the centre to the furthest vertex on the ground plane. */
  spread: number;
  pebbles: number;
  /** Metres the pebble bases are spread over. */
  clusterRadius: number;
}

export interface Cluster {
  mesh: ForgeMesh;
  pebbles: Pebble[];
  atlas: ChartAtlas;
  metrics: ClusterMetrics;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * How the sizes fall from the largest pebble to the smallest. Under 1 it bends
 * the run toward the small end, so a cluster is a few stones with gravel
 * around them rather than a graded set of samples.
 */
const SIZE_FALLOFF = 0.6;

/** Size of each pebble as a fraction of the largest, largest first. */
function sizesOf(count: number, smallest: number): number[] {
  if (count <= 1) return [1];
  return Array.from({ length: count }, (_, i) => mix(1, smallest, (i / (count - 1)) ** SIZE_FALLOFF));
}

/** A key in metres scaled to one pebble, with 0 left as 0 so it still derives. */
const sized = (value: number, scale: number): number => (value > 0 ? value * scale : 0);

/**
 * How far a pebble may sit inside its neighbour's reach. A little overlap at
 * the base is what nestling looks like: two stones that touch the ground
 * beside each other and lean together, rather than two discs set apart.
 */
const NESTLE = 0.12;

/** How much of the cluster's disc the pebbles cover, before the nestling. */
const COVERAGE = 0.55;

/** Placements tried against a neighbour before the search widens. */
const TRIES = 24;

/**
 * Metres the pebble bases are spread over: what the config says, else enough
 * ground for the pebbles asked for.
 *
 * Derived from the area they cover rather than from a count, so raising
 * `pebblesPerModel` spreads the cluster instead of packing it tighter. A
 * cluster that packs tighter as it grows reads as one lump of gravel.
 */
export function clusterRadiusOf(params: Params, reaches: number[]): number {
  if (params.clusterRadius > 0) return params.clusterRadius;
  const area = reaches.reduce((sum, reach) => sum + reach * reach, 0);
  return Math.sqrt(area / COVERAGE);
}

/** Whether a placement clears every pebble already down. */
function clears(placed: Pebble[], x: number, z: number, reach: number): boolean {
  return placed.every((pebble) => {
    const dx = x - pebble.origin[0];
    const dz = z - pebble.origin[2];
    return Math.hypot(dx, dz) >= (reach + pebble.reach) * (1 - NESTLE);
  });
}

/**
 * Where each pebble rests, largest first.
 *
 * Each new pebble is offered a place at the foot of one already down, which is
 * what nestles the small ones against the large. The search widens when that
 * place is taken, so a dense cluster still finds ground for every stone rather
 * than dropping the last few.
 */
function placeOf(rng: Rng, placed: Pebble[], reach: number, radius: number): [number, number] {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const host = placed[Math.floor(rng() * placed.length)];
    const angle = rng.range(0, Math.PI * 2);
    const away = (host.reach + reach) * (1 - NESTLE) * rng.range(1, 1.15);
    const x = host.origin[0] + Math.cos(angle) * away;
    const z = host.origin[2] + Math.sin(angle) * away;
    if (Math.hypot(x, z) <= radius && clears(placed, x, z, reach)) return [x, z];
  }

  // Nowhere against a neighbour. Fall back to the open disc, widening it until
  // there is room, so the count a config asks for is the count it gets.
  for (let attempt = 0; attempt < TRIES * 4; attempt++) {
    const spread = radius * (1 + attempt / TRIES);
    const angle = rng.range(0, Math.PI * 2);
    const away = Math.sqrt(rng()) * spread;
    const x = Math.cos(angle) * away;
    const z = Math.sin(angle) * away;
    if (clears(placed, x, z, reach)) return [x, z];
  }

  return [0, 0];
}

/** How far a pebble beds into the ground, as a fraction of its own height. */
const PEBBLE_SINK = 0.16;

/**
 * The pebbles a config describes, packed and ready to build. Every random
 * choice comes off the seed, so a coarser tier lands the same stones in the
 * same places under the same charts.
 */
export function packPebbles(params: Params): Pebble[] {
  const rng = createRng(params.seed ^ 0x70656262);
  const count = Math.max(1, params.pebblesPerModel);
  const sizes = sizesOf(count, params.pebbleSmallest);

  const fields = sizes.map((size, index) => {
    const field = rockField({
      ...params,
      // Its own seed, so no two pebbles of a cluster are the same stone.
      seed: (params.seed ^ (0x9e3779b9 * (index + 1))) | 0,
      height: params.height * size,
      width: sized(params.width, size),
      depth: sized(params.depth, size),
    });
    // Where the stone's own surface bottoms out, so `origin` places it by
    // where it rests. Found on a direction grid rather than on the mesh, so
    // every tier of one cluster shares one set of origins.
    field.base = baseOf(field);
    return field;
  });

  // The relief rides on the scooped surface, so the widest point is past the
  // extents by about what the noise displaces.
  const reaches = fields.map((field) => Math.max(field.extents[0], field.extents[2]) + field.relief);
  const radius = clusterRadiusOf(params, reaches);
  const placed: Pebble[] = [];

  fields.forEach((field, index) => {
    const reach = reaches[index];
    const [x, z] = placed.length === 0 ? [0, 0] : placeOf(rng, placed, reach, radius);
    placed.push({ field, origin: [x, -field.extents[1] * 2 * PEBBLE_SINK, z], reach });
  });

  return placed;
}

export function buildPebbleCluster(params: Params): Cluster {
  const pebbles = packPebbles(params);
  const atlas = chartAtlas(rockChartPx(params), pebbles.length);
  const out = createBuilder();

  for (const [block, pebble] of pebbles.entries())
    pushStone(out, pebble.field, atlas, block, params.subdivisions, pebble.origin);

  const attributes = finish(out);
  const { positions } = attributes;
  let height = 0;
  let spread = 0;
  for (let i = 0; i < positions.length; i += 3) {
    height = Math.max(height, positions[i + 1]);
    spread = Math.max(spread, Math.hypot(positions[i], positions[i + 2]));
  }

  return {
    mesh: { pieces: [{ key: 'stone', attributes, cutout: false }] },
    pebbles,
    atlas,
    metrics: {
      height,
      spread,
      pebbles: pebbles.length,
      clusterRadius: clusterRadiusOf(
        params,
        pebbles.map((pebble) => pebble.reach)
      ),
    },
  };
}
