import { Color } from "rewild-common";
import { Light } from "./Light";

export class AmbientLight extends Light {
  constructor(color: Color, intensity: f32) {
    super(color, intensity);

    this.type = "AmbientLight";
  }
}
