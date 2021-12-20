import { Light } from "./Light";
import { DirectionalLightShadow } from "./DirectionalLightShadow";
import { Object } from "../core/Object";
import { Color } from "../math/Color";

export class DirectionalLight extends Light {
  target: Object;
  shadow: DirectionalLightShadow;

  constructor(color: Color, intensity: f32) {
    super(color, intensity);

    this.type = "DirectionalLight";

    this.position.copy(Object.DefaultUp);

    this.target = new Object();
    this.shadow = new DirectionalLightShadow();

    this.updateMatrix();
  }

  dispose(): void {
    this.shadow.dispose();
  }

  copy(source: Object, recursive?: boolean): Object {
    super.copy(source, recursive);

    const sourceLight = source as DirectionalLight;

    this.target = sourceLight.clone();
    this.shadow = sourceLight.shadow.clone() as DirectionalLightShadow;

    return this;
  }
}
