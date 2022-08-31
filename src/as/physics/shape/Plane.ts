import { SHAPE_PLANE, AABB_PROX } from "../constants";
import { Shape } from "./Shape";
import { Vec3 } from "../math/Vec3";
import { MassInfo } from "./MassInfo";
import { ShapeConfig } from "./ShapeConfig";

/**
 * Plane shape.
 * @author lo-th
 */

export class Plane extends Shape {
  normal: Vec3;

  constructor(config: ShapeConfig, normal: Vec3 = new Vec3(0, 1, 0)) {
    super(config);

    this.type = SHAPE_PLANE;

    // radius of the shape.
    this.normal = normal;
  }

  volume(): f32 {
    return Number.MAX_VALUE;
  }

  calculateMassInfo(out: MassInfo): void {
    out.mass = this.density; //0.0001;
    let inertia = 1;
    out.inertia.set(inertia, 0, 0, 0, inertia, 0, 0, 0, inertia);
  }

  updateProxy(): void {
    let p = AABB_PROX;

    let min = -f32.MAX_VALUE;
    let max = f32.MAX_VALUE;
    let n = this.normal;
    // The plane AABB is infinite, except if the normal is pointing along any axis
    this.aabb.set(
      n.x === -1 ? this.position.x - p : min,
      n.x === 1 ? this.position.x + p : max,
      n.y === -1 ? this.position.y - p : min,
      n.y === 1 ? this.position.y + p : max,
      n.z === -1 ? this.position.z - p : min,
      n.z === 1 ? this.position.z + p : max
    );

    if (this.proxy != null) this.proxy!.update();
  }
}
