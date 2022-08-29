import { SHAPE_TETRA, AABB_PROX } from "../constants";
import { Vec3 } from "../math/Vec3";
import { MassInfo } from "./MassInfo";
import { Shape } from "./Shape";
import { ShapeConfig } from "./ShapeConfig";

/**
 * A tetra shape.
 * @author xprogram
 */
export class Tetra extends Shape {
  verts: Vec3[];
  faces: Tri[];

  constructor(config: ShapeConfig, p1: Vec3, p2: Vec3, p3: Vec3, p4: Vec3) {
    super(config);
    this.type = SHAPE_TETRA;

    // Vertices and faces of tetra
    this.verts = [p1, p2, p3, p4];
    this.faces = [this.mtri(0, 1, 2), this.mtri(1, 2, 3), this.mtri(2, 3, 4), this.mtri(4, 0, 1)];
  }

  calculateMassInfo(out: MassInfo): void {
    // I guess you could calculate box mass and split it
    // in half for the tetra...
    this.aabb.setFromPoints(this.verts);
    let p = this.aabb.elements;
    let x = p[3] - p[0];
    let y = p[4] - p[1];
    let z = p[5] - p[2];
    let mass = x * y * z * this.density;
    let divid = 1 / 12;
    out.mass = mass;
    out.inertia.set(
      mass * (2 * y * 2 * y + 2 * z * 2 * z) * divid,
      0,
      0,
      0,
      mass * (2 * x * 2 * x + 2 * z * 2 * z) * divid,
      0,
      0,
      0,
      mass * (2 * y * 2 * y + 2 * x * 2 * x) * divid
    );
  }

  updateProxy() {
    this.aabb.setFromPoints(this.verts);
    this.aabb.expandByScalar(AABB_PROX);

    if (this.proxy !== null) this.proxy.update();
  }

  mtri(a: i32, b: i32, c: i32): Tri {
    return new Tri(a, b, c);
  }
}

export class Tri {
  constructor(public a: i32, public b: i32, public c: i32) {}
}
