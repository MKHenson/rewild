import { Light } from "./Light";
import { Color } from "../math/Color";
import { Object } from "../core/Object";

export class HemisphereLight extends Light {
  groundColor: Color;

  constructor(skyColor: Color, groundColor: Color, intensity: f32) {
    super(skyColor, intensity);

    this.type = "HemisphereLight";

    this.position.copy(Object.DefaultUp);
    this.updateMatrix();

    this.groundColor = new Color(groundColor.r, groundColor.g, groundColor.b);
  }

  copy(source: HemisphereLight): HemisphereLight {
    Light.prototype.copy.call(this, source);

    this.groundColor.copy(source.groundColor);

    return this;
  }
}
