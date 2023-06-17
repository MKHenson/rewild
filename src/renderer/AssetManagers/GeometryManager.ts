import { BoxGeometry } from "../geometry/BoxGeometry";
import { SphereGeometry } from "../geometry/SphereGeometry";
import { PlaneGeometry } from "../geometry/PlaneGeometry";
import { Renderer } from "../Renderer";
import { AssetManager } from "./AssetManager";
import { Geometry } from "../geometry/Geometry";

export class GeometryManager extends AssetManager<Geometry> {
  constructor() {
    super();
  }

  async initialize(renderer: Renderer): Promise<void> {
    this.assets.push(
      new SphereGeometry(1, 64, 32).build(renderer),
      new BoxGeometry().build(renderer),
      new PlaneGeometry().build(renderer)
    );
  }
}

export const geometryManager = new GeometryManager();
