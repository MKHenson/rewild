import { IBehaviour } from './IBehaviour';

export interface IAsset {
  id: string;
  name: string;
  loaded: boolean;
  behaviours: IBehaviour[];
  load(): Promise<IAsset>;
  add(child: IAsset): IAsset;
  remove(child: IAsset): IAsset;
  mount(): void;
}
