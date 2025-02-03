import { TextureProperties } from './Texture';

export interface ITexture {
  gpuTexture: GPUTexture;
  properties: TextureProperties;
  load(device: GPUDevice): Promise<ITexture>;
}
