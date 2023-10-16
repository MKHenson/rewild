import { Color } from "rewild-common";
import { Light } from "./Light";

export class AmbientLight extends Light {
  constructor(color: Color, intensity: f32) {
    super(color, intensity);

    this.type = "AmbientLight";
  }
}

export function createAmbientLight(name: string | null = null): Light {
  const light = new AmbientLight(new Color(1, 1, 1), 1);
  if (name) light.name = name;
  return light;
}
