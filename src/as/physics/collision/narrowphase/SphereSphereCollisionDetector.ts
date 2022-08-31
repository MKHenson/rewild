import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Shape } from "../../shape/Shape";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Sphere } from "../../shape/Sphere";

/**
 * A collision detector which detects collisions between two spheres.
 * @author saharan
 */

export class SphereSphereCollisionDetector extends CollisionDetector {
  constructor() {
    super();
  }

  detectCollision(shape1: Sphere, shape2: Sphere, manifold: ContactManifold): void {
    const s1 = shape1;
    const s2 = shape2;
    const p1 = s1.position;
    const p2 = s2.position;
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dz = p2.z - p1.z;
    let len: f32 = dx * dx + dy * dy + dz * dz;
    const r1 = s1.radius;
    const r2 = s2.radius;
    const rad = r1 + r2;
    if (len > 0 && len < rad * rad) {
      len = Mathf.sqrt(len);
      const invLen: f32 = 1 / len;
      dx *= invLen;
      dy *= invLen;
      dz *= invLen;
      manifold.addPoint(p1.x + dx * r1, p1.y + dy * r1, p1.z + dz * r1, dx, dy, dz, len - rad, false);
    }
  }
}
