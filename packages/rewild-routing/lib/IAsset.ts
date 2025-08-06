export interface IAsset {
  name: string;
  add(child: IAsset): IAsset;
  remove(child: IAsset): IAsset;
}
