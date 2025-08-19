export interface IAsset {
  name: string;
  loaded: boolean;
  load(): Promise<IAsset>;
  add(child: IAsset): IAsset;
  remove(child: IAsset): IAsset;
  mount(): void;
}
