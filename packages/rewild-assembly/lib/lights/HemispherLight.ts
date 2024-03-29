import { Light } from "./Light";
import { Color } from "rewild-common";
import { TransformNode } from "../core/TransformNode";

export class HemisphereLight extends Light {
  groundColor: Color;

  constructor(skyColor: Color, groundColor: Color, intensity: f32) {
    super(skyColor, intensity);

    this.type = "HemisphereLight";

    this.position.copy(TransformNode.DefaultUp);
    this.updateMatrix();

    this.groundColor = new Color(groundColor.r, groundColor.g, groundColor.b);
  }

  copy(source: HemisphereLight): HemisphereLight {
    Light.prototype.copy.call(this, source);

    this.groundColor.copy(source.groundColor);

    return this;
  }
}
