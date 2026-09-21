// The three places a generated tree has to be declared before the world can
// grow it: the geometry registry, the scatter layer library, and the material
// registry.
//
// glTF carries no slot for a displacement map and the importer builds no
// heightMap from a file, so the materials.json block is the only route to the
// _disp texture. It is optional for that reason, and printed rather than
// required.

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  IGeometryTemplates,
  IMaterialsTemplate,
} from 'rewild-renderer/lib/managers/types';
import type { PhysicsShape } from 'rewild-renderer/lib/core/PhysicsShape';
import type { ScatterLayer } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import type { ClumpMetrics } from './clump.ts';
import type { Crown } from './crown.ts';
import { IMPOSTOR_DEFAULT, impostorDistance, type Params } from './params.ts';
import type { Rock } from './rock.ts';
import type { Skeleton } from './skeleton.ts';
import type { TextureNames } from './textures.ts';

const round = (value: number, places = 2): number => Number(value.toFixed(places));

export function geometryEntry(params: Params, modelUrl: string, lodUrls: string[] = []): IGeometryTemplates {
  return { [params.name]: { type: 'gltf', url: modelUrl, ...(lodUrls.length ? { lods: lodUrls } : {}) } };
}

/** One entry per piece the model ships, keyed by the piece's own key. */
export type TextureSetUrls = Record<string, TextureNames>;

/**
 * The optional materials.json block.
 *
 * Only pieces that carry a displacement map get a material, because the map is
 * the sole reason the block exists: the `.glb` already ships its own materials,
 * and binding one of these through `materialId` would replace every material in
 * the model with it. A clump writes no height map, so it writes no material
 * here and its block is textures alone.
 */
export function materialEntries(
  params: Params,
  textureUrls: TextureSetUrls,
  heightPieces: readonly string[]
): IMaterialsTemplate {
  const set = params.textureSet;

  const maps = (piece: string, urls: TextureNames) => [
    { name: `${set}-${piece}-diffuse`, url: urls.baseColor, colorSpace: 'srgb' as const },
    { name: `${set}-${piece}-normal`, url: urls.normal, colorSpace: 'linear' as const },
    { name: `${set}-${piece}-arm`, url: urls.arm, colorSpace: 'linear' as const },
    ...(heightPieces.includes(piece)
      ? [{ name: `${set}-${piece}-disp`, url: urls.height, colorSpace: 'linear' as const }]
      : []),
  ];

  return {
    textures: Object.entries(textureUrls).flatMap(([piece, urls]) => maps(piece, urls)),
    materials: heightPieces.map((piece) => ({
      name: `${set}-${piece}`,
      type: 'standard' as const,
      baseColorMap: `${set}-${piece}-diffuse`,
      normalMap: `${set}-${piece}-normal`,
      metallicRoughnessMap: `${set}-${piece}-arm`,
      occlusionMap: `${set}-${piece}-arm`,
      heightMap: `${set}-${piece}-disp`,
      parallax: false,
      heightScale: 0.04,
      metallic: 1,
      roughness: 1,
      normalScale: 1,
      vertexTangents: true,
    })),
  };
}

/** The collider proxy, measured off the trunk rather than guessed. */
export function colliderFor(params: Params, skeleton: Skeleton): PhysicsShape {
  const radius = round(params.trunkRadius * 1.05);
  const span = Math.max(skeleton.trunk.splitHeight, radius * 2.2);
  // PhysicsShape's capsule height is the cylindrical section, so the caps have to
  // come out of the span or the capsule stands two radii too tall.
  const height = round(Math.max(0.1, span - radius * 2));

  return { type: 'capsule', radius, height, offset: [0, round(radius + height / 2), 0] };
}

/**
 * Typed as the engine's own `ScatterLayer`, so a field added to that interface
 * fails this file rather than producing a row that no longer compiles once it
 * has been pasted in.
 */
/**
 * A clump's layer: no collider, laid partly onto the slope, and an impostor
 * only when the file sets one.
 *
 * **No impostor, unless asked.** A billboard is only worth baking while the
 * model covers more pixels than the tile has, and a tuft at half a metre is
 * under a 128px tile at every distance it is still drawn at. It culls instead,
 * which is what `granite_pebble` does for the same reason. A metres-wide patch
 * of plains grass is worth one, and sets it.
 *
 * **No collider.** A tuft of grass that stops the player is worse than one they
 * walk through.
 *
 * **No shadow, unless asked.** A tuft's shadow is a flicker of blade-sized
 * texels under itself, and the shadow pass would draw every card of every
 * patch to get it.
 *
 * **Laid partly onto the slope.** A tree stands upright whatever the ground
 * does. Grass does not: it grows from the surface, so it leans with it, but
 * not the whole way, or a hillside reads as combed.
 */
export function clumpLayer(params: Params, metrics: ClumpMetrics): ScatterLayer {
  return {
    name: params.name.replace(/-/g, '_'),
    geometryId: params.name,
    cullDistance: params.cullDistance,
    ...(params.impostor ? { impostor: { ...params.impostor, fromDistance: impostorDistance(params) } } : {}),
    jitter: {
      scale: { from: params.scaleMin, to: params.scaleMax },
      yaw: { from: 0, to: 360 },
      tilt: clumpTilt(metrics),
    },
    alignToNormal: 0.6,
    yOffset: clumpOffset(metrics),
    footprint: params.footprint > 0 ? params.footprint : clumpFootprint(metrics),
    wind: {
      amplitude: params.windAmplitude,
      frequency: params.windFrequency,
      flutter: params.windFlutter,
    },
    // Every card's normal describes the tuft, not the card, so none of them may
    // be mirrored on a back face. Same reason a tree's canopy mode sets it.
    authoredNormals: true,
    foliage: params.foliage,
    castShadow: params.castShadow,
  };
}

/**
 * Metres of clearance around a clump instance.
 *
 * A **patch** tiles: its cell is about as wide as the patch, because the patch
 * already carries its own density and overlapping two of them only doubles
 * what is already there.
 *
 * A **single tuft** gets twice its own radius instead. Tiling one lone tuft
 * would be right for the look and ruinous for the count — a 0.4m footprint puts
 * 360,000 candidates in every chunk, and the way to that density is a patch,
 * not a smaller number here.
 */
function clumpFootprint(metrics: ClumpMetrics): number {
  const factor = metrics.tufts > 1 ? 0.9 : 2;
  return round(Math.max(0.2, metrics.spread * factor), 2);
}

/**
 * Degrees of random lean, derived rather than fixed.
 *
 * A lean is a rotation about the model's origin, so what it costs at the rim
 * grows with the model. Twelve degrees on a lone tuft lifts its edge by eight
 * centimetres and reads as character. The same twelve on a three metre patch
 * lifts a corner by a third of a metre, and the far tufts hang in the air.
 *
 * So the angle is solved from the lift instead: whatever leaves the rim within
 * `CLUMP_TILT_LIFT` of the ground.
 */
const CLUMP_TILT_LIFT = 0.08;

function clumpTilt(metrics: ClumpMetrics): number {
  const span = Math.max(0.05, metrics.spread);
  const degrees = (Math.asin(Math.min(1, CLUMP_TILT_LIFT / span)) * 180) / Math.PI;
  return Math.max(2, Math.min(14, Math.round(degrees)));
}

/**
 * How far the model is sunk into the ground.
 *
 * A patch is posed off one height sample and one slope sample, so its far
 * corners sit a little above or below the ground they cover. Sinking it splits
 * that error the cheap way round: a tuft buried a few centimetres still shows
 * most of its blades, and one floating the same few centimetres shows daylight
 * underneath it.
 */
function clumpOffset(metrics: ClumpMetrics): number {
  return round(-Math.max(metrics.height * 0.05, metrics.patchRadius * 0.06), 3);
}

export function scatterLayer(params: Params, skeleton: Skeleton): ScatterLayer {
  const footprint = params.footprint > 0 ? params.footprint : round(skeleton.canopy.spread * 0.8, 1);

  return {
    name: params.name.replace(/-/g, '_'),
    geometryId: params.name,
    ...(params.lods.length ? { lodDistances: params.lods.map((tier) => tier.distance) } : {}),
    cullDistance: params.cullDistance,
    impostor: { ...(params.impostor ?? IMPOSTOR_DEFAULT), fromDistance: impostorDistance(params) },
    jitter: { scale: { from: params.scaleMin, to: params.scaleMax }, yaw: { from: 0, to: 360 }, tilt: 3 },
    // Trees stand up whatever the slope does. A tilted trunk reads as damage,
    // not as terrain.
    alignToNormal: 0,
    footprint,
    collider: colliderFor(params, skeleton),
    wind: {
      amplitude: params.windAmplitude,
      frequency: params.windFrequency,
      flutter: params.windFlutter,
    },
    // `card` is the one mode whose normals are the cards' own, and so the one
    // mode a back face may mirror.
    authoredNormals: params.leafNormalMode !== 'card',
    // A card stands in for a cluster of leaves whatever its normal says, so it
    // reflects off its own face and its occlusion shades its highlights too.
    foliage: params.foliage,
    castShadow: params.castShadow,
  };
}

/**
 * A crown's layer is decided by its stem.
 *
 * With one it is a tree: it stands upright, stops the player at the stem and
 * hands over to a billboard. Without one it is ground cover, and takes
 * everything a clump's layer decides for the same reasons — no impostor at a
 * metre tall, no collider, and laid partly onto the slope it grows from.
 */
export function crownLayer(params: Params, crown: Crown): ScatterLayer {
  if (crown.skeleton) return scatterLayer(params, crown.skeleton);
  return clumpLayer(params, { height: crown.metrics.height, spread: crown.metrics.spread, patchRadius: 0, tufts: 1 });
}

/** Fraction of a rock's height the layer sinks it by, so it beds into the slope. */
const ROCK_SINK = 0.2;

/**
 * A rock's layer: laid onto the slope, sunk into it, stopped at its own hull,
 * and never moved by the wind.
 *
 * The hull is the mesh's support points, so it is measured rather than
 * guessed, and the scale jitter scales it with the mesh. The footprint is a
 * little under the rock's own span: boulders touch.
 */
export function rockLayer(params: Params, rock: Rock): ScatterLayer {
  const { metrics } = rock;
  const span = Math.max(metrics.width, metrics.depth);

  return {
    name: params.name.replace(/-/g, '_'),
    geometryId: params.name,
    ...(params.lods.length ? { lodDistances: params.lods.map((tier) => tier.distance) } : {}),
    cullDistance: params.cullDistance,
    ...(params.impostor ? { impostor: { ...params.impostor, fromDistance: impostorDistance(params) } } : {}),
    jitter: { scale: { from: params.scaleMin, to: params.scaleMax }, yaw: { from: 0, to: 360 }, tilt: 8 },
    alignToNormal: 1,
    yOffset: -round(metrics.height * ROCK_SINK),
    footprint: params.footprint > 0 ? params.footprint : round(Math.max(0.3, span * 0.8), 1),
    collider: { type: 'hull', points: metrics.hull },
    castShadow: params.castShadow,
  };
}

/**
 * The layer as its scatter-layers.json entry, ready to paste.
 *
 * A yaw range is a block every type fills in, so a gap in it is a generator
 * bug rather than an authoring choice. Wind, an impostor and a collider are
 * not: a clump has none of them and a rock has no wind, on purpose.
 */
export function scatterLayerEntry(layer: ScatterLayer): string {
  const { jitter, collider } = layer;
  if (!jitter.yaw)
    throw new Error(`Scatter layer '${layer.name}' is missing a block the generator always fills in.`);
  if (collider && collider.type === 'capsule' && !collider.offset)
    throw new Error(`Scatter layer '${layer.name}' capsule collider needs an offset.`);
  if (collider && collider.type !== 'capsule' && collider.type !== 'hull')
    throw new Error(`Scatter layer '${layer.name}' collider must be a capsule or a hull, got a ${collider.type}.`);

  return JSON.stringify({ [layer.name]: layer }, null, 2).split('\n').slice(1, -1).join('\n');
}

async function patchJson<T>(path: string, mutate: (contents: T) => void): Promise<void> {
  const contents = JSON.parse(await readFile(path, 'utf8')) as T;
  mutate(contents);
  await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`);
}

export async function writeGeometryTemplate(directory: string, geometry: IGeometryTemplates): Promise<void> {
  await patchJson<IGeometryTemplates>(join(directory, 'geometries.json'), (contents) =>
    Object.assign(contents, geometry)
  );
}

export async function writeMaterialTemplate(directory: string, materials: IMaterialsTemplate): Promise<void> {
  await patchJson<IMaterialsTemplate>(join(directory, 'materials.json'), (contents) => {
    for (const texture of materials.textures) {
      const index = contents.textures.findIndex((entry) => entry.name === texture.name);
      if (index === -1) contents.textures.push(texture);
      else contents.textures[index] = texture;
    }

    for (const material of materials.materials) {
      const index = contents.materials.findIndex((entry) => entry.name === material.name);
      if (index === -1) contents.materials.push(material);
      else contents.materials[index] = material;
    }
  });
}

export async function writeTemplateFiles(
  directory: string,
  geometry: IGeometryTemplates,
  materials: IMaterialsTemplate
): Promise<void> {
  await writeGeometryTemplate(directory, geometry);
  await writeMaterialTemplate(directory, materials);
}

/**
 * The key an entry for this layer already sits under: the layer's name, or a
 * key whose entry names it. Undefined when the file has none.
 */
export function scatterLayerKey(contents: Record<string, ScatterLayer>, name: string): string | undefined {
  if (name in contents) return name;
  return Object.keys(contents).find((key) => contents[key].name === name);
}

/**
 * Patches the layer into a scatter-layers.json: replaced whole where an entry
 * carries its name, appended where none does. Never reordered, because the
 * key order is the paint mask's slot order.
 */
export async function writeScatterLayer(path: string, layer: ScatterLayer): Promise<void> {
  await patchJson<Record<string, ScatterLayer>>(path, (contents) => {
    contents[scatterLayerKey(contents, layer.name) ?? layer.name] = layer;
  });
}
