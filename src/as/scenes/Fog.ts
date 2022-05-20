import { Color } from "../../common/math/Color";

export class Fog {
  isFog: boolean = true;
  name: string;
  color: Color;
  near: f32;
  far: f32;

  constructor(color: Color, near: f32 = 1, far: f32 = 1000) {
    this.name = "";
    this.color = new Color(color.r, color.g, color.b);
    this.near = near;
    this.far = far;
  }

  clone(): Fog {
    return new Fog(this.color, this.near, this.far);
  }

  // TODO:
  //   toJSON() {
  //     return {
  //       type: "Fog",
  //       color: this.color.getHex(),
  //       near: this.near,
  //       far: this.far,
  //     };
  //   }
}
