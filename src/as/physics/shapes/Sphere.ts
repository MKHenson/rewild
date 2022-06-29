import { Vec3 } from "../maths/Vec3";
import { Shape, ShapeType } from "./Shape";

export class Sphere extends Shape {
  radius: f32;

  constructor(radius: f32 = 1) {
    super(ShapeType.SPHERE, null);

    this.radius = radius;

    if (this.radius < 0) {
      throw new Error("The sphere radius cannot be negative.");
    }

    this.updateBoundingSphereRadius();
  }

  calculateLocalInertia(mass: f32, target: Vec3): Vec3 {
    target = target || new Vec3();
    var I = (2.0 * mass * this.radius * this.radius) / 5.0;
    target.x = I;
    target.y = I;
    target.z = I;
    return target;
  }

  volume(): f32 {
    return (4.0 * Mathf.PI * this.radius) / 3.0;
  }

  updateBoundingSphereRadius(): void {
    this.boundingSphereRadius = this.radius;
  }

  calculateWorldAABB(pos: Vec3, quat: null, min: Vec3, max: Vec3): void {
    var r = this.radius;

    min.x = pos.x - r;
    max.x = pos.x + r;

    min.y = pos.y - r;
    max.y = pos.y + r;

    min.z = pos.z - r;
    max.z = pos.z + r;
  }
}
