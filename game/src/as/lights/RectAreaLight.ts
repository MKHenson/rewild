import { Color } from "../../common/math/Color";
import { Light } from "./Light";

export class RectAreaLight extends Light {
  width: f32;
  height: f32;

  constructor(color: Color, intensity: f32, width: f32 = 10, height: f32 = 10) {
    super(color, intensity);

    this.type = "RectAreaLight";

    this.width = width;
    this.height = height;
  }

  get power(): f32 {
    // compute the light's luminous power (in lumens) from its intensity (in nits)
    return this.intensity * this.width * this.height * Math.PI;
  }

  set power(power: f32) {
    // set the light's intensity (in nits) from the desired luminous power (in lumens)
    this.intensity = power / (this.width * this.height * Math.PI);
  }

  copy(source: RectAreaLight): RectAreaLight {
    super.copy(source);

    this.width = source.width;
    this.height = source.height;

    return this;
  }

  // TODO:
  // toJSON( meta ) {

  // 	const data = super.toJSON( meta );

  // 	data.object.width = this.width;
  // 	data.object.height = this.height;

  // 	return data;

  // }
}
