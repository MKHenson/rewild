import { Shape } from '../shapes/Shape';
import { Vec3 } from '../math/Vec3';
import { Quaternion } from '../math/Quaternion';

/**
 * Spherical shape
 * @example
 *     const radius = 1
 *     const sphereShape = new CANNON.Sphere(radius)
 *     const sphereBody = new CANNON.Body({ mass: 1, shape: sphereShape })
 *     world.addBody(sphereBody)
 */
export class Sphere extends Shape {
  /**
   * The radius of the sphere.
   */
  radius: f32;

  /**
   *
   * @param radius The radius of the sphere, a non-negative number.
   */
  constructor(radius: f32 = 1.0) {
    super(Shape.SPHERE);

    this.radius = radius;

    if (this.radius < 0) {
      throw new Error('The sphere radius cannot be negative.');
    }

    this.updateBoundingSphereRadius();
  }

  /** calculateLocalInertia */
  calculateLocalInertia(mass: f32, target: Vec3 = new Vec3()): Vec3 {
    const I = (2.0 * mass * this.radius * this.radius) / 5.0;
    target.x = I;
    target.y = I;
    target.z = I;
    return target;
  }

  /** volume */
  volume(): f32 {
    return (4.0 * Mathf.PI * Mathf.pow(this.radius, 3)) / 3.0;
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
