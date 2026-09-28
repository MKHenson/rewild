import { Renderer } from '../../Renderer';
import { resolveAssetUrl } from '../../managers/TextureManager';
import { BitmapTexture } from '../../textures/BitmapTexture';
import { TextureProperties } from '../../textures/Texture';

/** A puff of sea spray, white against transparent (SeaSpray). */
export const WATER_SPRAY_TEXTURE = 'water-spray';

export async function initWaterTextures(renderer: Renderer): Promise<void> {
  const spray = new BitmapTexture(
    new TextureProperties(WATER_SPRAY_TEXTURE, true, 'srgb'),
    resolveAssetUrl('nature/water/sea-spray.png')
  );
  await spray.load(renderer);
  renderer.textureManager.addTexture(spray);
}
