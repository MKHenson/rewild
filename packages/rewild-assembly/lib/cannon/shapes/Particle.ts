import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import { Shape } from "./Shape";

export class Particle extends Shape {
  /**
   * Particle shape.
   * @class Particle
   * @constructor
   * @author schteppe
   * @extends Shape
   */
  constructor() {
    super(Shape.PARTICLE);
  }

  /**
   * @method calculateLocalInertia
   * @param  {Number} mass
   * @param  {Vec3} target
   * @return {Vec3}
   */
  calculateLocalInertia(mass: f32, target: Vec3): Vec3 {
    target = target || new Vec3();
    target.set(0, 0, 0);
    return target;
  }

  volume = function () {
    return 0;
  };

  updateBoundingSphereRadius() {
    this.boundingSphereRadius = 0;
  }

  calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3) {
    // Get each axis max
    min.copy(pos);
    max.copy(pos);
  }
}
