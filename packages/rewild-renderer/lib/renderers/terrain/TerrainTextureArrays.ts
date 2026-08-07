import { Renderer } from '../..';
import { resolveAssetUrl } from '../../managers/TextureManager';
import { TextureArray } from '../../textures/TextureArray';
import { TextureProperties } from '../../textures/Texture';
import { TerrainLayerParams } from '../../materials/uniforms/TerrainUniforms';
import { ClimateConfig, getClimatePalette } from './Biomes';
import {
  BLEND_DEPTH,
  TERRAIN_MATERIALS,
  getTerrainMaterial,
  getTerrainMaterialLayer,
  getTerrainMaterialOrder,
  validateTerrainMaterials,
} from './TerrainMaterials';

// textureManager keys for the arrays every terrain layer samples from. Layer i
// of each is getTerrainMaterialOrder()[i] — the arrays share one layer order,
// so a material's albedo, normal and ARM are always the same array_index.
export const TERRAIN_ALBEDO_ARRAY = 'terrain-albedo-array';
export const TERRAIN_NORMAL_ARRAY = 'terrain-normal-array';
// Packed ARM: occlusion R, roughness G, metallic B.
export const TERRAIN_ARM_ARRAY = 'terrain-arm-array';
export const TERRAIN_HEIGHT_ARRAY = 'terrain-height-array';

/**
 * Builds the terrain albedo, normal, ARM and height texture arrays from the
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

  // Albedo is the only one of the four that is sRGB-encoded colour; normal, ARM
  // and height are data maps whose bytes are already the value the shader
  // wants. ARM especially — decoding it would bend the roughness curve and
  // silently change every highlight.
  const albedo = new TextureArray(
    new TextureProperties(TERRAIN_ALBEDO_ARRAY, true, 'srgb'),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].albedoUrl))
  );
  // Normal, ARM and height are linear
  // If not exported properly they can cause issues with lighting.
  // Use the npm textures checkers to audit them if need be
  const normal = new TextureArray(
    new TextureProperties(TERRAIN_NORMAL_ARRAY, true, 'linear'),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].normalUrl))
  );
  const arm = new TextureArray(
    new TextureProperties(TERRAIN_ARM_ARRAY, true, 'linear'),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].armUrl))
  );
  const height = new TextureArray(
    new TextureProperties(TERRAIN_HEIGHT_ARRAY, true, 'linear'),
    order.map((name) => resolveAssetUrl(TERRAIN_MATERIALS[name].heightUrl))
  );

  await Promise.all([
    albedo.load(renderer),
    normal.load(renderer),
    arm.load(renderer),
    height.load(renderer),
  ]);

  renderer.textureManager.addTexture(albedo);
  renderer.textureManager.addTexture(normal);
  renderer.textureManager.addTexture(arm);
  renderer.textureManager.addTexture(height);
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
    // The macro normal is a layer in the same normal array, but not necessarily
    // this material's: `macroNormalFrom` lets a material whose detail normal
    // reads badly at metre scale borrow a coarser one. The convention travels
    // with the *source*, since it describes that texture's green channel, not
    // this material's.
    const macroSource = material.macroNormalFrom
      ? getTerrainMaterial(material.macroNormalFrom)
      : material;
    return {
      layerIndex: getTerrainMaterialLayer(name),
      uvScale: material.uvScale,
      macroUvScale: material.macroUvScale ?? 0,
      macroLayerIndex: getTerrainMaterialLayer(macroSource.name),
      macroStrength: material.macroStrength ?? 1,
      heightScale: material.heightScale,
      roughnessFactor: material.roughness,
      occlusionStrength: material.occlusionStrength ?? 1,
      blendDepth: material.blendDepth ?? BLEND_DEPTH,
      // Our tangent frame's Y runs down the image, matching DirectX; an OpenGL
      // map's green points the other way and has to be inverted.
      normalYSign: material.normalConvention === 'opengl' ? -1 : 1,
      macroNormalYSign: macroSource.normalConvention === 'opengl' ? -1 : 1,
    };
  });
}
