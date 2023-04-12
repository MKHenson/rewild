/**
 * Ref: https://en.wikipedia.org/wiki/Spherical_coordinate_system
 *
 * The polar angle (phi) is measured from the positive y-axis. The positive y-axis is up.
 * The azimuthal angle (theta) is measured from the positive z-axis.
 */

import * as MathUtils from "./MathUtils";
import { Vector3 } from "./Vector3";

export class Spherical {
  radius: f32;
  phi: f32;
  theta: f32;

  constructor(radius: f32 = 1, phi: f32 = 0, theta: f32 = 0) {
    this.radius = radius;
    this.phi = phi; // polar angle
    this.theta = theta; // azimuthal angle

    return this;
  }

  set(radius: f32, phi: f32, theta: f32): Spherical {
    this.radius = radius;
    this.phi = phi;
    this.theta = theta;

    return this;
  }

  copy(other: Spherical): Spherical {
    this.radius = other.radius;
    this.phi = other.phi;
    this.theta = other.theta;

    return this;
  }

  // restrict phi to be betwee EPS and PI-EPS
  makeSafe(): Spherical {
    const EPS: f32 = 0.000001;
    this.phi = Mathf.max(EPS, Mathf.min(Mathf.PI - EPS, this.phi));

    return this;
  }

  setFromVector3(v: Vector3): Spherical {
    return this.setFromCartesianCoords(v.x, v.y, v.z);
  }

  setFromCartesianCoords(x: f32, y: f32, z: f32): Spherical {
    this.radius = Mathf.sqrt(x * x + y * y + z * z);

    if (this.radius === 0) {
      this.theta = 0;
      this.phi = 0;
    } else {
      this.theta = Mathf.atan2(x, z);
      this.phi = Mathf.acos(MathUtils.clamp(y / this.radius, -1, 1));
    }

    return this;
  }

  clone(): Spherical {
    return new Spherical().copy(this);
  }
}
