/**
 * Ref: https://en.wikipedia.org/wiki/Cylindrical_coordinate_system
 */

import { Vector3 } from "./Vector3";

export class Cylindrical {
  radius: f32;
  theta: f32;
  y: f32;

  constructor(radius: f32 = 1, theta: f32 = 0, y: f32 = 0) {
    this.radius = radius; // distance from the origin to a point in the x-z plane
    this.theta = theta; // counterclockwise angle in the x-z plane measured in radians from the positive z-axis
    this.y = y; // height above the x-z plane

    return this;
  }

  set(radius: f32, theta: f32, y: f32): Cylindrical {
    this.radius = radius;
    this.theta = theta;
    this.y = y;

    return this;
  }

  copy(other: Cylindrical): Cylindrical {
    this.radius = other.radius;
    this.theta = other.theta;
    this.y = other.y;

    return this;
  }

  setFromVector3(v: Vector3): Cylindrical {
    return this.setFromCartesianCoords(v.x, v.y, v.z);
  }

  setFromCartesianCoords(x: f32, y: f32, z: f32): Cylindrical {
    this.radius = Mathf.sqrt(x * x + z * z);
    this.theta = Mathf.atan2(x, z);
    this.y = y;

    return this;
  }

  clone(): Cylindrical {
    return new Cylindrical().copy(this);
  }
}
