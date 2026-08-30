// The scatter layer library — the named things that stand on the terrain.
// Game content designed in code, like TERRAIN_MATERIALS: never persisted, only
// referenced by name from biome rules and by slot from a scatter paint mask.
//
// `geometryId` keys into templates/geometries.json, which also owns the layer's
// LOD meshes. The layer owns only where the tiers hand over, since the same
// model scattered at two scales drops tier at two different distances.

import { SelectorBand } from './Biomes';

// The far tier: a billboard sampled from an octahedral atlas baked off the
// layer's own mesh. Baked rather than authored, so nothing here names an asset.
export interface ScatterImpostor {
  // Metres at which the billboard replaces the last mesh tier.
  fromDistance: number;
  // Captured views per octahedral axis: `views²` tiles in the atlas.
  views: number;
  // Pixels per atlas tile; the atlas is `views * tileSize` square.
  tileSize: number;
}

// The shape physics collides against, in un-jittered local space with the origin
// on the ground. A trunk capsule, not a trimesh of the render mesh.
export type ScatterCollider =
  | {
      type: 'box';
      /** Full extents; halved for Rapier at registration. */
      size: [number, number, number];
      offset?: [number, number, number];
    }
  | { type: 'sphere'; radius: number; offset?: [number, number, number] }
  | {
      type: 'capsule';
      radius: number;
      /** Cylindrical section only, excluding the caps — Rapier's halfHeight * 2. */
      height: number;
      offset?: [number, number, number];
    };

// Per-instance randomisation, derived by the placer from the instance hash.
export interface ScatterJitter {
  /** Uniform scale multiplier. */
  scale: SelectorBand;
  /** Degrees about world up. Omitted ⇒ a full turn. */
  yaw?: SelectorBand;
  /** Maximum random lean from upright, in degrees, applied after alignment. */
  tilt?: number;
}

// Vertex-stage foliage motion driven by the weather's wind. Per-vertex weights
// come from the model's COLOR_0 — R bend, G phase, B flutter — so a mesh with no
// COLOR_0 reads as rigid and the block does nothing.
export interface ScatterWind {
  /** Metres of sway at bend weight 1 in full wind. */
  amplitude: number;
  /** Sway cycles per second. */
  frequency: number;
  /** Per-leaf flutter as a fraction of `amplitude`, gated by COLOR_0.b. */
  flutter: number;
}

export interface ScatterLayer {
  name: string;
  /** Key into templates/geometries.json — the model, and LOD tier 0. */
  geometryId: string;
  /** Metres at which each of the geometry's LOD tiers takes over, ascending.
   *  Shorter than the chain leaves the remaining tiers unused. */
  lodDistances?: number[];
  impostor?: ScatterImpostor;
  /** Metres beyond which instances are not drawn. */
  cullDistance: number;
  jitter: ScatterJitter;
  /** Metres above the sampled surface, before scale jitter. */
  yOffset?: number;
  /** 0 keeps instances upright, 1 lays them onto the slope. Same meaning as the
   *  placement field of the same name. */
  alignToNormal?: number;
  /** Radius in metres the placer keeps clear around an instance — what turns a
   *  biome density into a count. */
  footprint: number;
  collider?: ScatterCollider;
  wind?: ScatterWind;
}

const MESH_CULL_DISTANCE = 400;
const FULL_TURN: SelectorBand = { from: 0, to: 360 };

// Rows are data — adding something the world can grow is a table edit here plus
// a density rule in the biome that grows it. The two rocks share one model
// deliberately: a layer is not a model.
export const SCATTER_LAYERS: Record<string, ScatterLayer> = {
  granite_boulder: {
    name: 'granite_boulder',
    geometryId: 'granite-rock',
    cullDistance: MESH_CULL_DISTANCE,
    impostor: { fromDistance: 220, views: 8, tileSize: 128 },
    jitter: { scale: { from: 0.8, to: 2.2 }, yaw: FULL_TURN, tilt: 6 },
    // Sunk so a boulder beds in rather than balancing on one sampled vertex.
    yOffset: -0.15,
    alignToNormal: 1,
    footprint: 3.5,
    collider: { type: 'box', size: [2.23, 1.12, 1.25] },
  },
  // The same rock as ground clutter. No collider: a pebble that stops the
  // player is worse than one they walk through.
  granite_pebble: {
    name: 'granite_pebble',
    geometryId: 'granite-rock',
    cullDistance: 120,
    jitter: { scale: { from: 0.12, to: 0.35 }, yaw: FULL_TURN, tilt: 25 },
    yOffset: -0.05,
    alignToNormal: 1,
    footprint: 0.8,
  },
  // The foliage template. Nothing flags a layer as foliage — cutout leaves come
  // from the model's own glTF material. What differs is upright placement, a
  // stem proxy rather than the model's bounds, and a wind block.
  alien_plant: {
    name: 'alien_plant',
    geometryId: 'alient-plant',
    cullDistance: 260,
    impostor: { fromDistance: 140, views: 8, tileSize: 128 },
    jitter: { scale: { from: 0.7, to: 1.3 }, yaw: FULL_TURN, tilt: 4 },
    alignToNormal: 0,
    footprint: 2.5,
    collider: { type: 'capsule', radius: 0.45, height: 7.5 },
    wind: { amplitude: 0.35, frequency: 0.55, flutter: 0.4 },
  },
};

// Throws rather than falling back: a layer name only comes from this table, so
// a miss is a typo.
export function getScatterLayer(name: string): ScatterLayer {
  const layer = SCATTER_LAYERS[name];
  if (!layer) throw new Error(`Unknown scatter layer '${name}'.`);
  return layer;
}

// Slot order for scatter paint mask channels. A persisted mask is written
// against it, so appending is free but reordering re-points every channel after
// the change. Add, don't reorder.
export function getScatterLayerOrder(): string[] {
  return Object.keys(SCATTER_LAYERS);
}

/** The slot a layer occupies, or -1 if it isn't in the library. */
export function getScatterLayerSlot(name: string): number {
  return getScatterLayerOrder().indexOf(name);
}

function validateBand(layer: string, field: string, band: SelectorBand): void {
  if (band.to < band.from)
    throw new Error(
      `Scatter layer '${layer}' ${field} range ${band.from}..${band.to} is inverted — a jitter range is drawn from, not ramped across.`
    );
}

function validateImpostor(
  layer: ScatterLayer,
  impostor: ScatterImpostor,
  lastLodDistance: number
): void {
  if (impostor.fromDistance <= lastLodDistance)
    throw new Error(
      `Scatter layer '${layer.name}' impostor at ${impostor.fromDistance}m is not beyond its last mesh LOD at ${lastLodDistance}m.`
    );

  if (impostor.fromDistance >= layer.cullDistance)
    throw new Error(
      `Scatter layer '${layer.name}' impostor at ${impostor.fromDistance}m is beyond its cullDistance ${layer.cullDistance}m, so it would never draw.`
    );

  if (!Number.isInteger(impostor.views) || impostor.views < 2)
    throw new Error(
      `Scatter layer '${layer.name}' impostor needs at least 2 views per axis, got ${impostor.views}.`
    );

  if (!Number.isInteger(impostor.tileSize) || impostor.tileSize <= 0)
    throw new Error(
      `Scatter layer '${layer.name}' impostor tileSize must be a positive integer.`
    );
}

function validateCollider(
  layer: ScatterLayer,
  collider: ScatterCollider
): void {
  const invalid =
    collider.type === 'box'
      ? collider.size.some((extent) => extent <= 0)
      : collider.type === 'sphere'
      ? collider.radius <= 0
      : collider.radius <= 0 || collider.height <= 0;

  if (invalid)
    throw new Error(
      `Scatter layer '${layer.name}' ${collider.type} collider must have positive dimensions.`
    );
}

function validateWind(layer: ScatterLayer, wind: ScatterWind): void {
  if (wind.amplitude <= 0)
    throw new Error(
      `Scatter layer '${layer.name}' wind amplitude must be positive — omit the wind block to disable it.`
    );

  if (wind.frequency <= 0)
    throw new Error(
      `Scatter layer '${layer.name}' wind frequency must be positive.`
    );

  if (wind.flutter < 0)
    throw new Error(
      `Scatter layer '${layer.name}' wind flutter must not be negative (0 disables it).`
    );
}

/**
 * Fails loudly on a mis-authored table rather than scattering something subtly
 * wrong. `geometryLodCounts` is optional because the table is code while
 * geometries.json is fetched: pass the loaded ids and their tier counts to also
 * check every model resolves, or omit it to validate the numbers alone.
 */
export function validateScatterLayers(
  geometryLodCounts?: ReadonlyMap<string, number>
): void {
  for (const key in SCATTER_LAYERS) {
    const layer = SCATTER_LAYERS[key];

    if (layer.name !== key)
      throw new Error(
        `Scatter layer '${key}' is named '${layer.name}' — the key and the name must match.`
      );

    if (geometryLodCounts && !geometryLodCounts.has(layer.geometryId))
      throw new Error(
        `Scatter layer '${layer.name}' references unknown geometry '${layer.geometryId}'.`
      );

    if (layer.cullDistance <= 0)
      throw new Error(
        `Scatter layer '${layer.name}' cullDistance must be positive.`
      );

    // Zero is an unbounded instance count, not a dense one.
    if (layer.footprint <= 0)
      throw new Error(
        `Scatter layer '${layer.name}' footprint must be positive — it is the radius the placer keeps clear.`
      );

    if (
      layer.alignToNormal !== undefined &&
      (layer.alignToNormal < 0 || layer.alignToNormal > 1)
    )
      throw new Error(
        `Scatter layer '${layer.name}' alignToNormal must be within 0..1.`
      );

    validateBand(layer.name, 'scale', layer.jitter.scale);
    if (layer.jitter.yaw) validateBand(layer.name, 'yaw', layer.jitter.yaw);

    if (layer.jitter.scale.from <= 0)
      throw new Error(
        `Scatter layer '${layer.name}' scale range must be positive.`
      );

    if (layer.jitter.tilt !== undefined && layer.jitter.tilt < 0)
      throw new Error(
        `Scatter layer '${layer.name}' tilt must not be negative (0 is upright).`
      );

    const lodDistances = layer.lodDistances ?? [];

    const lodCount = geometryLodCounts?.get(layer.geometryId);
    if (lodCount !== undefined && lodDistances.length > lodCount)
      throw new Error(
        `Scatter layer '${layer.name}' gives ${lodDistances.length} LOD distances but geometry '${layer.geometryId}' carries ${lodCount} LOD meshes.`
      );

    // Tiers are compared nearest-first and the first match wins, so an
    // unordered chain silently skips whatever it overtakes.
    let lastLodDistance = 0;
    for (const distance of lodDistances) {
      if (distance <= lastLodDistance)
        throw new Error(
          `Scatter layer '${layer.name}' LOD distances must ascend — ${distance} does not follow ${lastLodDistance}.`
        );

      if (distance >= layer.cullDistance)
        throw new Error(
          `Scatter layer '${layer.name}' LOD at ${distance}m is beyond its cullDistance ${layer.cullDistance}m, so that tier would never draw.`
        );

      lastLodDistance = distance;
    }

    if (layer.impostor)
      validateImpostor(layer, layer.impostor, lastLodDistance);
    if (layer.collider) validateCollider(layer, layer.collider);
    if (layer.wind) validateWind(layer, layer.wind);
  }
}
