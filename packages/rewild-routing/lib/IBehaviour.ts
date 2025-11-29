import { IAsset } from './IAsset';

export interface IBehaviour {
  name: string;
  onAdded?(asset: IAsset): void;
  onRemoved?(asset: IAsset): void;
  onUpdate(delta: f32, total: u32, asset: IAsset): void;
  onMount?(asset: IAsset): void;
}
