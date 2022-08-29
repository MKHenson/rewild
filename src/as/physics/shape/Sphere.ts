import { SHAPE_SPHERE, AABB_PROX } from "../constants";
import { Shape } from "./Shape";
import { ShapeConfig } from "./ShapeConfig";
import { MassInfo } from "./MassInfo";

/**
 * Sphere shape
 * @author saharan
 * @author lo-th
 */

export class Sphere extends Shape {
  radius: f32;

  constructor(config: ShapeConfig, radius: f32) {
    super(config);

    this.type = SHAPE_SPHERE;

    // radius of the shape.
    this.radius = radius;
  }

  volume() {
    return Mathf.PI * this.radius * 1.333333;
  }

  calculateMassInfo(out: MassInfo): void {
    let mass = this.volume() * this.radius * this.radius * this.density; //1.333 * _Math.PI * this.radius * this.radius * this.radius * this.density;
    out.mass = mass;
    let inertia = mass * this.radius * this.radius * 0.4;
    out.inertia.set(inertia, 0, 0, 0, inertia, 0, 0, 0, inertia);
  }

  updateProxy(): void {
    let p = AABB_PROX;

    this.aabb.set(
      this.position.x - this.radius - p,
      this.position.x + this.radius + p,
      this.position.y - this.radius - p,
      this.position.y + this.radius + p,
      this.position.z - this.radius - p,
      this.position.z + this.radius + p
    );

    if (this.proxy != null) this.proxy.update();
  }
}
