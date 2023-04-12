import { Color } from "@rewild/Common";

export class FogExp2 {
  isFogExp2: boolean = true;
  color: Color;
  name: string;
  density: f32;

  constructor(color: Color, density: f32 = 0.00025) {
    this.name = "";

    this.color = new Color(color.r, color.g, color.b);
    this.density = density;
  }

  clone(): FogExp2 {
    return new FogExp2(this.color, this.density);
  }

  // TODO:
  //   toJSON() {
  //     return {
  //       type: "FogExp2",
  //       color: this.color.getHex(),
  //       density: this.density,
  //     };
  //   }
}
