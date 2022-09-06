import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Vec3 } from "../../math/Vec3";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Tetra } from "../../shape/Tetra";

/**
 * Class for collision detection based on
 * ray casting. Ray source from THREE. This
 * class should only be used with the tetra
 * or a polygon.
 * @author xprogram
 */
export class RayCollisionDetector extends CollisionDetector {
  constructor() {
    super();
  }

  detectCollision(shape1: Tetra, shape2: Tetra, manifold: ContactManifold): void {
    let pos1 = shape1.position;
    let pos2 = shape2.position;
    let vec3_1 = new Vec3(pos1.x, pos1.y, pos1.z);
    let vec3_2 = new Vec3(pos2.x, pos2.y, pos2.z);
    let intersect;

    // Yes, it is a brute force approach but it works for now...
    for (let i = 0; i < shape2.faces.length; i++) {
      intersect = this.triangleIntersect(vec3_1, vec3_1.angleTo(vec3_2), shape2.faces[i], false);

      if (intersect != null) manifold.addPoint(new Vec3(intersect.x, intersect.y, intersect.z));
    }
  }

  /**
   * @author bhouston / http://clara.io
   */
  triangleIntersect(origin: Vec3, direction: Vec3, face: Vec3, backfaceCulling: boolean) {
    let diff = new Vec3();
    let edge1 = new Vec3();
    let edge2 = new Vec3();
    let normal = new Vec3();

    let a = face.a,
      b = face.b,
      c = face.c;
    let sign, DdN;

    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    normal.crossVectors(edge1, edge2);

    DdN = direction.dot(normal);
    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN = -DdN;
    } else {
      return null;
    }

    diff.subVectors(this.origin, a);
    let DdQxE2 = sign * direction.dot(edge2.crossVectors(diff, edge2));

    // b1 < 0, no intersection
    if (DdQxE2 < 0) {
      return null;
    }

    let DdE1xQ = sign * direction.dot(edge1.cross(diff));

    // b2 < 0, no intersection
    if (DdE1xQ < 0) {
      return null;
    }

    // b1+b2 > 1, no intersection
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }

    // Line intersects triangle, check if ray does.
    let QdN = -sign * diff.dot(normal);

    // t < 0, no intersection
    if (QdN < 0) {
      return null;
    }

    // Ray intersects triangle.
    return new Vec3()
      .copy(direction)
      .multiplyScalar(QdN / DdN)
      .add(origin);
  }
}
