import { Renderer } from '../..';
import { resolveAssetUrl } from '../../managers/TextureManager';
import { TextureArray } from '../../textures/TextureArray';
import { TextureProperties } from '../../textures/Texture';
import { TerrainLayerParams } from '../../materials/uniforms/TerrainUniforms';
import { ClimateConfig, getClimatePalette } from './Biomes';
import {
  TERRAIN_MATERIALS,
  getTerrainMaterial,
  getTerrainMaterialLayer,
  getTerrainMaterialOrder,
  validateTerrainMaterials,
} from './TerrainMaterials';

// textureManager keys for the arrays every terrain layer samples from. Layer i
// of each is getTerrainMaterialOrder()[i] — the arrays share one layer order,
// so a material's albedo, normal and roughness are always the same array_index.
export const TERRAIN_ALBEDO_ARRAY = 'terrain-albedo-array';
export const TERRAIN_NORMAL_ARRAY = 'terrain-normal-array';
export const TERRAIN_ROUGHNESS_ARRAY = 'terrain-roughness-array';

/**
 * Builds the terrain albedo, normal and roughness texture arrays from the
 * material library and registers them with the texture manager.
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
  const roughness = new TextureArray(
    new TextureProperties(TERRAIN_ROUGHNESS_ARRAY),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].roughnessUrl))
  );

  await Promise.all([
    albedo.load(renderer),
    normal.load(renderer),
    roughness.load(renderer),
  ]);

  renderer.textureManager.addTexture(albedo);
  renderer.textureManager.addTexture(normal);
  renderer.textureManager.addTexture(roughness);
}

/**
 * The shader's per-splat-channel layer params for a climate: channel i weights
 * the palette's i-th material, which lives at texture-array layer
 * `layerIndex`.
 *
 * This is the palette indirection. Today it is near-identity — the palette is
 * global and the arrays hold the whole library — but going through it from the
 * start is what lets per-chunk palettes land later by changing only what fills
 * this array, not the shader.
 */
export function getClimateLayerParams(
  climate: ClimateConfig
): TerrainLayerParams[] {
  return getClimatePalette(climate).map((name) => {
    const material = getTerrainMaterial(name);
    return {
      layerIndex: getTerrainMaterialLayer(name),
      uvScale: material.uvScale,
      macroUvScale: material.macroUvScale ?? 0,
      specular: material.specular,
      // Our tangent frame's Y runs down the image, matching DirectX; an OpenGL
      // map's green points the other way and has to be inverted.
      normalYSign: material.normalConvention === 'opengl' ? -1 : 1,
    };
  });
}
