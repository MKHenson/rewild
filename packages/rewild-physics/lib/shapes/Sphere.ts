import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import { Shape } from "./Shape";

export class Sphere extends Shape {
  radius: f32;

  /**
   * Spherical shape
   * @class Sphere
   * @constructor
   * @extends Shape
   * @param {Number} radius The radius of the sphere, a non-negative number.
   * @author schteppe / http://github.com/schteppe
   */
  constructor(radius: f32 = 1.0) {
    super(Shape.SPHERE);

    /**
     * @property {Number} radius
     */
    this.radius = radius;

    if (this.radius < 0) {
      throw new Error("The sphere radius cannot be negative.");
    }

    this.updateBoundingSphereRadius();
  }

  calculateLocalInertia(mass: f32, target = new Vec3()): Vec3 {
    const I = (2.0 * mass * this.radius * this.radius) / 5.0;
    target.x = I;
    target.y = I;
    target.z = I;
    return target;
  }

  volume(): f32 {
    return (4.0 * Math.PI * this.radius) / 3.0;
  }

  updateBoundingSphereRadius(): void {
    this.boundingSphereRadius = this.radius;
  }

  calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3): void {
    const r = this.radius;

    min.x = pos.x - r;
    max.x = pos.x + r;
    min.y = pos.y - r;
    max.y = pos.y + r;
    min.z = pos.z - r;
    max.z = pos.z + r;
  }
}
