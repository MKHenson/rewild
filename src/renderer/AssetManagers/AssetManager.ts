import { Renderer } from "../Renderer";

export abstract class AssetManager<T extends { name: string }> {
  assets: T[];

  constructor() {
    this.assets = [];
  }

  getAsset(name: string) {
    const toRet = this.assets.find((p) => p.name === name);
    if (!toRet) throw new Error(`Could not find asset with name ${name}`);
    return toRet;
  }

  abstract initialize(renderer: Renderer): void;
}
