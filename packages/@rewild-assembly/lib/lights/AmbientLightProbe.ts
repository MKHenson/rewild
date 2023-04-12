import { Color, SphericalHarmonics3 } from "@rewild/Common";
import { LightProbe } from "./LightProbe";

export class AmbientLightProbe extends LightProbe {
  constructor(color: Color, intensity: f32 = 1) {
    super(new SphericalHarmonics3(), intensity);
    const color1 = new Color(1, 1, 1).setFromColor(color);

    // without extra factor of PI in the shader, would be 2 / Mathf.sqrt( Mathf.PI );
    this.sh.coefficients[0].set(color1.r, color1.g, color1.b).multiplyScalar(2 * Mathf.sqrt(Mathf.PI));
  }
}
