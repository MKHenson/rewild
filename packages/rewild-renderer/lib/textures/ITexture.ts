import { Renderer } from '..';
import { TextureProperties } from './Texture';

export interface ITexture {
  gpuTexture: GPUTexture;
  properties: TextureProperties;
  /** Alpha histogram per mip, for an alpha test to hold its coverage down
   *  the chain. Null or absent for a texture with nothing to thin. */
  alphaHistograms?: Uint32Array[] | null;
  load(device: Renderer): Promise<ITexture>;
}
