import { ManifoldPoint } from "./ManifoldPoint";
import { Vec3 } from "../../math/Vec3";
import { Shape } from "../../shape/Shape";
import { RigidBody } from "../../core/RigidBody";

/**
 * A contact manifold between two shapes.
 * @author saharan
 * @author lo-th
 */

export class ContactManifold {
  body1: RigidBody | null;
  // The second rigid body.
  body2: RigidBody | null;
  // The number of manifold points.
  numPoints: i32;
  // The manifold points.
  points: ManifoldPoint[];

  constructor() {
    this.body1 = null;
    this.body2 = null;
    this.numPoints = 0;
    this.points = [new ManifoldPoint(), new ManifoldPoint(), new ManifoldPoint(), new ManifoldPoint()];
  }

  //Reset the manifold.
  reset(shape1: Shape, shape2: Shape): void {
    this.body1 = shape1.parent;
    this.body2 = shape2.parent;
    this.numPoints = 0;
  }

  //  Add a point into this manifold.
  addPointVec(pos: Vec3, norm: Vec3, penetration: f32, flip: boolean): void {
    const p = this.points[this.numPoints++];

    p.position.copy(pos);
    p.localPoint1.sub(pos, this.body1!.position).applyMatrix3(this.body1!.rotation);
    p.localPoint2.sub(pos, this.body2!.position).applyMatrix3(this.body2!.rotation);

    p.normal.copy(norm);
    if (flip) p.normal.negate();

    p.normalImpulse = 0;
    p.penetration = penetration;
    p.warmStarted = false;
  }

  //  Add a point into this manifold.
  addPoint(x: f32, y: f32, z: f32, nx: f32, ny: f32, nz: f32, penetration: f32, flip: boolean): void {
    const p = this.points[this.numPoints++];

    p.position.set(x, y, z);
    p.localPoint1.sub(p.position, this.body1!.position).applyMatrix3(this.body1!.rotation);
    p.localPoint2.sub(p.position, this.body2!.position).applyMatrix3(this.body2!.rotation);

    p.normalImpulse = 0;

    p.normal.set(nx, ny, nz);
    if (flip) p.normal.negate();

    p.penetration = penetration;
    p.warmStarted = false;
  }
}