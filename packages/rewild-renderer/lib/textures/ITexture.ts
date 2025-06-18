import { Renderer } from '..';
import { TextureProperties } from './Texture';

export interface ITexture {
  gpuTexture: GPUTexture;
  properties: TextureProperties;
  load(device: Renderer): Promise<ITexture>;
}
