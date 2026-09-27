import { Renderer } from '../../Renderer';
import { resolveAssetUrl } from '../../managers/TextureManager';
import { BitmapTexture } from '../../textures/BitmapTexture';
import { TextureProperties } from '../../textures/Texture';

/** Tileable foam: white against transparent. water.wgsl thresholds its
 *  brightness × alpha, so more foam grows patches from the densest clumps. */
export const WATER_FOAM_TEXTURE = 'water-foam';

export async function initWaterTextures(renderer: Renderer): Promise<void> {
  // Linear: the shader reads it as a threshold field, not as a colour.
  const foam = new BitmapTexture(
    new TextureProperties(WATER_FOAM_TEXTURE, true, 'linear'),
    resolveAssetUrl('nature/water/sea-foam.webp')
  );
  await foam.load(renderer);
  renderer.textureManager.addTexture(foam);
}
