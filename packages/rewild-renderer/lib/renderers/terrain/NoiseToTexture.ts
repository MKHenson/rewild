import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';
import { textureManager } from '../../textures/TextureManager';

export function noiseToTexture(
  width: number,
  height: number,
  noise: Float32Array
) {
  // Convert this noise map of f32 to a u8 texture. Each pixel will be a shader of grey
  // (0-255) based on the noise value.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = Math.floor(Math.min(1, Math.max(0, noise[i])) * 255);
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255; // alpha
  }

  const terrainTexture = textureManager.addTexture(
    new DataTexture(
      new TextureProperties('terrain1', false),
      data,
      width,
      height
    )
  );

  return terrainTexture;
}
