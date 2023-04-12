import { Color, SphericalHarmonics3 } from "@rewild/Common";
import { Light } from "./Light";

export class LightProbe extends Light {
  sh: SphericalHarmonics3;

  constructor(sh = new SphericalHarmonics3(), intensity: f32 = 1) {
    super(new Color(1, 1, 1), intensity);

    this.sh = sh;
  }

  copy(source: LightProbe): LightProbe {
    super.copy(source);

    this.sh.copy(source.sh);

    return this;
  }

  // TODO:

  //   fromJSON(json) {
  //     this.intensity = json.intensity; // TODO: Move this bit to Light.fromJSON();
  //     this.sh.fromArray(json.sh);

  //     return this;
  //   }

  //   toJSON(meta) {
  //     const data = super.toJSON(meta);

  //     data.object.sh = this.sh.toArray();

  //     return data;
  //   }
}
