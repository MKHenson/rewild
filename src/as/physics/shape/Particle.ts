import { SHAPE_PARTICLE, AABB_PROX } from "../constants";
import { Shape } from "./Shape";
import { Vec3 } from "../math/Vec3";
import { MassInfo } from "./MassInfo";
import { ShapeConfig } from "./ShapeConfig";

/**
 * A Particule shape
 * @author lo-th
 */

export class Particle extends Shape {
  normal: Vec3;

  constructor(config: ShapeConfig, normal: Vec3) {
    super(config);
    this.type = SHAPE_PARTICLE;
    this.normal = normal;
  }

  volume(): f32 {
    return Number.MAX_VALUE;
  }

  calculateMassInfo(out: MassInfo): void {
    var inertia = 0;
    out.inertia.set(inertia, 0, 0, 0, inertia, 0, 0, 0, inertia);
  }

  updateProxy(): void {
    var p = 0; //AABB_PROX;

    this.aabb.set(
      this.position.x - p,
      this.position.x + p,
      this.position.y - p,
      this.position.y + p,
      this.position.z - p,
      this.position.z + p
    );

    if (this.proxy != null) this.proxy.update();
  }
}
