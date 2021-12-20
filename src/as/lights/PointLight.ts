import { Color } from "../math/Color";
import { Light } from "./Light";
import { PointLightShadow } from "./PointLightShadow";

export class PointLight extends Light {
  distance: f32;
  decay: f32;
  shadow: PointLightShadow;

  constructor(color: Color, intensity: f32, distance: f32 = 0, decay: f32 = 1) {
    super(color, intensity);

    this.type = "PointLight";

    this.distance = distance;
    this.decay = decay; // for physically correct lights, should be 2.

    this.shadow = new PointLightShadow();
  }

  get power(): f32 {
    // compute the light's luminous power (in lumens) from its intensity (in candela)
    // for an isotropic light source, luminous power (lm) = 4 π luminous intensity (cd)
    return this.intensity * 4 * Math.PI;
  }

  set power(power: f32) {
    // set the light's intensity (in candela) from the desired luminous power (in lumens)
    this.intensity = power / (4 * Math.PI);
  }

  dispose(): void {
    this.shadow.dispose();
  }

  copy(source: PointLight): PointLight {
    super.copy(source);

    this.distance = source.distance;
    this.decay = source.decay;

    this.shadow = source.shadow.clone() as PointLightShadow;

    return this;
  }
}
