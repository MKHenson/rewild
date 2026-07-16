import { Renderer } from '../..';
import { resolveAssetUrl } from '../../managers/TextureManager';
import { TextureArray } from '../../textures/TextureArray';
import { TextureProperties } from '../../textures/Texture';
import {
  TERRAIN_MATERIALS,
  getTerrainMaterialOrder,
  validateTerrainMaterials,
} from './TerrainMaterials';

// textureManager keys for the two arrays every terrain layer samples from.
// Layer i of each is getTerrainMaterialOrder()[i] — the arrays share one layer
// order, so a material's albedo and normal are always the same array_index.
export const TERRAIN_ALBEDO_ARRAY = 'terrain-albedo-array';
export const TERRAIN_NORMAL_ARRAY = 'terrain-normal-array';

/**
 * Builds the terrain albedo and normal texture arrays from the material library
 * and registers them with the texture manager.
 *
 * One `texture_2d_array` binding per map replaces a binding per material, so a
 * fragment can pick a layer with a runtime `array_index` — which is what lets
 * the shader blend an arbitrary number of materials from the splat map.
 *
 * The material table carries its own URLs rather than going through
 * materials.json: these textures are only ever sampled through these arrays, so
 * a shared-template entry would also load each one as a standalone texture that
 * nothing binds.
 */
export async function initTerrainTextureArrays(
  renderer: Renderer
): Promise<void> {
  validateTerrainMaterials();

  const order = getTerrainMaterialOrder();

  const albedo = new TextureArray(
    new TextureProperties(TERRAIN_ALBEDO_ARRAY),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].albedoUrl))
  );
  const normal = new TextureArray(
    new TextureProperties(TERRAIN_NORMAL_ARRAY),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].normalUrl))
  );

  await Promise.all([albedo.load(renderer), normal.load(renderer)]);

  renderer.textureManager.addTexture(albedo);
  renderer.textureManager.addTexture(normal);
}
