// The scatter layer library — the named things that stand on the terrain.
// Game content authored in templates/scatter-layers.json and bundled at build
// time: never persisted with a world, only referenced by name from biome rules
// and by slot from a scatter paint mask.
//
// `geometryId` keys into templates/geometries.json, which also owns the layer's
// LOD meshes. The layer owns only where the tiers hand over, since the same
// model scattered at two scales drops tier at two different distances.

import { PhysicsShape, physicsShapeError } from '../../core/PhysicsShape';
import type { SelectorBand } from './Biomes';
import scatterLayersJson from '../../../../../templates/scatter-layers.json';

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
// COLOR_0 reads as rigid and the block does nothing. Every field is what the
// layer does in full wind; the weather's windiness scales all three down from
// there, so a block is tuned once at 1 and a calm day takes care of itself.
export interface ScatterWind {
  /** Metres of sway at bend weight 1 in full wind. */
  amplitude: number;
  /** Sway cycles per second in full wind. */
  frequency: number;
  /** Per-leaf flutter as a fraction of `amplitude` in full wind, gated by
   *  COLOR_0.b. */
  flutter: number;
}

/**
 * A layer's wind block as the scatter shaders' `windParams` vec4 — zeros for a
 * rigid layer, which the wind pipeline is never compiled for anyway — followed
 * by `windOrigin`, the drawing chunk's world xz, so the wind field is read in
 * world space and crosses chunk borders without a seam.
 */
export function writeScatterWindParams(
  wind: ScatterWind | null | undefined,
  originX: number,
  originZ: number,
  out: Float32Array,
  offset: number
): void {
  out[offset] = wind ? wind.amplitude : 0;
  out[offset + 1] = wind ? wind.frequency : 0;
  out[offset + 2] = wind ? wind.flutter : 0;
  out[offset + 3] = 0;
  out[offset + 4] = originX;
  out[offset + 5] = originZ;
  out[offset + 6] = 0;
  out[offset + 7] = 0;
}

export interface ScatterLayer {
  name: string;
  /** Key into templates/geometries.json — the model, and LOD tier 0. */
  geometryId: string;
  /** Overrides the model's own glTF materials with this one from
   *  templates/materials.json, the same way a template-library asset does. A
   *  model whose glTF material is a bare placeholder needs it. */
  materialId?: string;
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
  /** The proxy physics collides against, in un-jittered local space with the
   *  origin on the ground — the same block a template-library asset authors
   *  under `physics.shape`. The instance's scale, rotation and position pose it
   *  at registration. Omit it to walk through the layer. */
  collider?: PhysicsShape;
  wind?: ScatterWind;
  /** Shade the model's cutout piece with its normals as authored, rather than
   *  mirroring them on back faces. For foliage whose cards carry the whole
   *  canopy's outward normal instead of each card's own — mirroring one turns
   *  it inward and blacks out whichever half of the cards faces away. Applies
   *  only to the model's alpha-masked primitives, so a trunk is untouched. */
  authoredNormals?: boolean;
  /**
   * Shade the layer's cutout piece as foliage rather than as a
   * metallic-roughness surface.
   *
   * Drops the specular chain and three of the five texture fetches the standard
   * model takes per fragment, and adds the transmission that makes a backlit
   * blade read as a blade. Applies to the alpha-masked primitives only, so a
   * tree's trunk keeps the standard model while its canopy does not.
   */
  foliage?: boolean;

  /** Draw the layer into the shadow maps. Defaults to true. Off for ground
   *  cover whose shadow is a flicker of blade-sized texels under itself. */
  castShadow?: boolean;
}

// Rows are data — adding something the world can grow is an entry in
// templates/scatter-layers.json plus a density rule in the biome that grows
// it. scatter-forge writes the entry for a model it builds. Bundled at build
// time so the table is there for the worker and for module-scope code alike.
// JSON widens the collider's literal types and tuples, so the cast goes
// through unknown; `validateScatterLayers` is what checks the rows.
export const SCATTER_LAYERS = scatterLayersJson as unknown as Record<
  string,
  ScatterLayer
>;

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

// The furthest any layer draws.
export function getMaxScatterCullDistance(): number {
  let max = 0;
  for (const key in SCATTER_LAYERS)
    max = Math.max(max, SCATTER_LAYERS[key].cullDistance);
  return max;
}

// How far ahead of the draw range a chunk starts generating. Placement is a
// worker round trip, so generating only once a layer is already in range makes
// instances appear later than they vanish — the same crossing reads as two
// different distances depending on which way you walk it. Wide enough to cover
// the round trip plus the movement threshold that batches visibility updates.
const SCATTER_PREFETCH = 150;

// The range a chunk generates instances over, out beyond where any layer draws
// so they are resident before they are needed. Still far short of the terrain's
// view distance, which is what keeps distant chunks free.
export function getScatterGenerationDistance(): number {
  return getMaxScatterCullDistance() + SCATTER_PREFETCH;
}

/** The slot a layer occupies, or -1 if it isn't in the library. */
export function getScatterLayerSlot(name: string): number {
  return getScatterLayerOrder().indexOf(name);
}

/**
 * The scatter density mask's channel layout: one channel per layer slot, then
 * one exclusion channel past the end.
 *
 * Exclusion is a channel rather than the absence of paint because zero already
 * means "say nothing, let the biome decide". Clearings, building sites and
 * paths need the opposite — "nothing grows here, whatever the biome wants" —
 * and that is a weight of its own. It is one channel, not one per layer: an
 * author clearing a building site is clearing it of everything.
 */
export function scatterExcludeChannel(): number {
  return getScatterLayerOrder().length;
}

export function scatterMaskChannels(): number {
  return getScatterLayerOrder().length + 1;
}

/** Mesh tiers a layer draws: the model plus one per LOD distance. A geometry
 *  carrying more tiers than the layer names distances for leaves them unused. */
export function meshTierCount(layer: ScatterLayer): number {
  return (layer.lodDistances?.length ?? 0) + 1;
}

/** Every tier a layer draws: its mesh tiers, then the impostor when it has
 *  one. The impostor is always the last, so its index is this minus one. */
export function lodTierCount(layer: ScatterLayer): number {
  return meshTierCount(layer) + (layer.impostor ? 1 : 0);
}

/** Metres at which tier k + 1 takes over from tier k: the LOD distances, then
 *  the impostor's. */
function lodHandover(layer: ScatterLayer, k: number): number {
  const lods = layer.lodDistances ?? [];
  return k < lods.length ? lods[k] : layer.impostor!.fromDistance;
}

// The bands a tier draws once the bias has shifted the chain. An instance in
// band k draws at tier clamp(k + bias, 0, last), so the end tiers absorb
// whatever the shift pushes past them: a bias that outruns the chain leaves
// the whole range on the model, or on its coarsest tier. `high < low` when the
// shift leaves the tier nothing.
function lowestSourceBand(tier: number, tierCount: number, bias: number) {
  if (tier === 0) return 0;
  return tier === tierCount - 1 ? Math.max(tier - bias, 0) : tier - bias;
}

function highestSourceBand(tier: number, tierCount: number, bias: number) {
  const last = tierCount - 1;
  if (tier === last) return last;
  return tier === 0 ? Math.min(tier - bias, last) : tier - bias;
}

function drawsNothing(tier: number, tierCount: number, bias: number) {
  const low = lowestSourceBand(tier, tierCount, bias);
  const high = highestSourceBand(tier, tierCount, bias);
  return low > high || low < 0 || high > tierCount - 1;
}

// The cross-fade at a handover, as a fraction of its distance: a near handover
// is crossed quickly and can afford a short blend, a far one has room for a
// long one. Clamped so a very near handover still blends over a few strides.
const LOD_FADE_FRACTION = 0.06;
const LOD_FADE_MIN = 3;
const LOD_FADE_MAX = 40;

/** Half the width in metres of the cross-fade centred on a handover. */
export function lodFadeHalfWidth(handover: number): number {
  return Math.min(
    LOD_FADE_MAX,
    Math.max(LOD_FADE_MIN, handover * LOD_FADE_FRACTION)
  );
}

/** Metres at which a tier starts drawing; 0 for whichever tier is nearest. */
export function lodTierNear(
  layer: ScatterLayer,
  tier: number,
  bias = 0
): number {
  const tierCount = lodTierCount(layer);
  if (drawsNothing(tier, tierCount, bias)) return 0;
  const band = lowestSourceBand(tier, tierCount, bias);
  return band === 0 ? 0 : lodHandover(layer, band - 1);
}

/**
 * Metres at which a tier hands over — to the next tier, or to nothing at the
 * cull distance for the last. Never past the cull distance, so pulling that in
 * at runtime truncates the chain rather than leaving a tier drawing beyond it.
 * No greater than the tier's near when it has nothing to draw, so `near < far`
 * is the test for a tier that draws.
 */
export function lodTierFar(
  layer: ScatterLayer,
  tier: number,
  bias = 0
): number {
  const tierCount = lodTierCount(layer);
  if (drawsNothing(tier, tierCount, bias)) return 0;
  const band = highestSourceBand(tier, tierCount, bias);
  return band === tierCount - 1
    ? layer.cullDistance
    : Math.min(lodHandover(layer, band), layer.cullDistance);
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

function validateCollider(layer: ScatterLayer, collider: PhysicsShape): void {
  const error = physicsShapeError(collider);
  if (error) throw new Error(`Scatter layer '${layer.name}' ${error}.`);
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
