import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Vec3 } from "../../math/Vec3";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Sphere } from "../../shape/Sphere";

/**
 * A collision detector which detects collisions between two spheres.
 * @author saharan
 * @author lo-th
 */

export class SphereSphereCollisionDetector extends CollisionDetector {
  n: Vec3;
  p: Vec3;
  constructor() {
    super();
    this.n = new Vec3();
    this.p = new Vec3();
  }

  detectCollision(shape1: Sphere, shape2: Sphere, manifold: ContactManifold) {
    const n = this.n;
    const p = this.p;

    const s1 = shape1;
    const s2 = shape2;

    n.sub(s2.position, s1.position);
    const rad = s1.radius + s2.radius;
    let len = n.lengthSq();

    if (len > 0 && len < rad * rad) {
      len = Mathf.sqrt(len);
      n.scaleEqual(1 / len);

      //n.normalize();
      p.copy(s1.position).addScaledVector(n, s1.radius);
      manifold.addPointVec(p, n, len - rad, false);
    }
  }
}
