import { Vec3 } from "../maths/Vec3";
import { Pool } from "./Pool";

/**
 * @class Vec3Pool
 * @constructor
 * @extends Pool
 */
export class Vec3Pool extends Pool<Vec3> {
  constructor() {
    super();
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
