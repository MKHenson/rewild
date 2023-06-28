import { Vec3 } from "../math/Vec3";
import { Pool } from "./Pool";

export class Vec3Pool extends Pool<Vec3> {
  type: typeof Vec3;
  /**
   * @class Vec3Pool
   * @constructor
   * @extends Pool
   */
  constructor() {
    super();
    this.type = Vec3;
  }

  /**
   * Construct a vector
   * @method constructObject
   * @return {Vec3}
   */
  constructObject(): Vec3 {
    return new Vec3();
  }
}
