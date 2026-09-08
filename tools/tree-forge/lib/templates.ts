// The three places a generated tree has to be declared before the world can
// grow it: the geometry registry, the material registry, and the scatter layer
// library.
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
import type {
  ScatterCollider,
  ScatterLayer,
} from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import type { Params } from './params.ts';
import type { Skeleton } from './skeleton.ts';
import type { TextureNames } from './textures.ts';

const round = (value: number, places = 2): number => Number(value.toFixed(places));

export function geometryEntry(params: Params, modelUrl: string): IGeometryTemplates {
  return { [params.name]: { type: 'gltf', url: modelUrl } };
}

export function materialEntries(params: Params, textureUrls: TextureNames): IMaterialsTemplate {
  const set = params.textureSet;

  return {
    textures: [
      { name: `${set}-diffuse`, url: textureUrls.baseColor, colorSpace: 'srgb' },
      { name: `${set}-normal`, url: textureUrls.normal, colorSpace: 'linear' },
      { name: `${set}-arm`, url: textureUrls.arm, colorSpace: 'linear' },
      { name: `${set}-disp`, url: textureUrls.height, colorSpace: 'linear' },
    ],
    materials: [
      {
        name: `${set}-bark`,
        type: 'standard',
        baseColorMap: `${set}-diffuse`,
        normalMap: `${set}-normal`,
        metallicRoughnessMap: `${set}-arm`,
        occlusionMap: `${set}-arm`,
        heightMap: `${set}-disp`,
        parallax: false,
        heightScale: 0.04,
        metallic: 1,
        roughness: 1,
        normalScale: 1,
        vertexTangents: true,
      },
    ],
  };
}

/** The collider proxy, measured off the trunk rather than guessed. */
export function colliderFor(params: Params, skeleton: Skeleton): ScatterCollider {
  const radius = round(params.trunkRadius * 1.05);
  const span = Math.max(skeleton.trunk.splitHeight, radius * 2.2);
  // ScatterCollider's height is the cylindrical section, so the caps have to
  // come out of the span or the capsule stands two radii too tall.
  const height = round(Math.max(0.1, span - radius * 2));

  return { type: 'capsule', radius, height, offset: [0, round(radius + height / 2), 0] };
}

/**
 * Typed as the engine's own `ScatterLayer`, so a field added to that interface
 * fails this file rather than producing a row that no longer compiles once it
 * has been pasted in.
 */
export function scatterLayer(params: Params, skeleton: Skeleton): ScatterLayer {
  const footprint = params.footprint > 0 ? params.footprint : round(skeleton.canopy.spread * 0.8, 1);

  return {
    name: params.name.replace(/-/g, '_'),
    geometryId: params.name,
    cullDistance: params.cullDistance,
    impostor: { fromDistance: round(params.cullDistance * 0.6, 0), views: 8, tileSize: 128 },
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
  };
}

/** The layer as source, formatted the way SCATTER_LAYERS is already written. */
export function scatterLayerSource(layer: ScatterLayer): string {
  // Most of ScatterLayer is optional, because most layers do not need most of
  // it. A tree always gets all of this, so a gap here is a generator bug rather
  // than an authoring choice, and it is worth naming as one.
  const { jitter, impostor, collider, wind } = layer;
  if (!impostor || !collider || !wind || !jitter.yaw)
    throw new Error(`Scatter layer '${layer.name}' is missing a block the generator always fills in.`);
  if (collider.type !== 'capsule' || !collider.offset)
    throw new Error(`Scatter layer '${layer.name}' collider must be a capsule with an offset, got a ${collider.type}.`);
  const yaw = jitter.yaw.from === 0 && jitter.yaw.to === 360 ? 'FULL_TURN' : `{ from: ${jitter.yaw.from}, to: ${jitter.yaw.to} }`;

  return [
    `  ${layer.name}: {`,
    `    name: '${layer.name}',`,
    `    geometryId: '${layer.geometryId}',`,
    `    cullDistance: ${layer.cullDistance},`,
    `    impostor: { fromDistance: ${impostor.fromDistance}, views: ${impostor.views}, tileSize: ${impostor.tileSize} },`,
    `    jitter: { scale: { from: ${jitter.scale.from}, to: ${jitter.scale.to} }, yaw: ${yaw}, tilt: ${jitter.tilt} },`,
    `    alignToNormal: ${layer.alignToNormal},`,
    `    footprint: ${layer.footprint},`,
    `    collider: { type: '${collider.type}', radius: ${collider.radius}, height: ${collider.height}, offset: [${collider.offset.join(', ')}] },`,
    `    wind: { amplitude: ${wind.amplitude}, frequency: ${wind.frequency}, flutter: ${wind.flutter} },`,
    '  },',
  ].join('\n');
}

async function patchJson<T>(path: string, mutate: (contents: T) => void): Promise<void> {
  const contents = JSON.parse(await readFile(path, 'utf8')) as T;
  mutate(contents);
  await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`);
}

export async function writeTemplateFiles(
  directory: string,
  geometry: IGeometryTemplates,
  materials: IMaterialsTemplate
): Promise<void> {
  await patchJson<IGeometryTemplates>(join(directory, 'geometries.json'), (contents) =>
    Object.assign(contents, geometry)
  );

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
