import { Light } from "./Light";
import { SpotLightShadow } from "./SpotLightShadow";
import { TransformNode } from "../core/TransformNode";
import { Color } from "@rewild/common";

export class SpotLight extends Light {
  target: TransformNode;
  distance: f32;
  angle: f32;
  penumbra: f32;
  decay: f32;
  shadow: SpotLightShadow;

  constructor(
    color: Color,
    intensity: f32,
    distance: f32 = 0,
    angle: f32 = Mathf.PI / 3,
    penumbra: f32 = 0,
    decay: f32 = 1
  ) {
    super(color, intensity);

    this.type = "SpotLight";

    this.position.copy(TransformNode.DefaultUp);
    this.updateMatrix();

    this.target = new TransformNode();

    this.distance = distance;
    this.angle = angle;
    this.penumbra = penumbra;
    this.decay = decay; // for physically correct lights, should be 2.

    this.shadow = new SpotLightShadow();
  }

  get power(): f32 {
    // compute the light's luminous power (in lumens) from its intensity (in candela)
    // by convention for a spotlight, luminous power (lm) = π * luminous intensity (cd)
    return this.intensity * Mathf.PI;
  }

  set power(power: f32) {
    // set the light's intensity (in candela) from the desired luminous power (in lumens)
    this.intensity = power / Math.PI;
  }

  dispose(): void {
    this.shadow.dispose();
  }

  copy(source: SpotLight): SpotLight {
    super.copy(source);

    this.distance = source.distance;
    this.angle = source.angle;
    this.penumbra = source.penumbra;
    this.decay = source.decay;

    this.target = source.target.clone();

    this.shadow = source.shadow.clone() as SpotLightShadow;

    return this;
  }
}
