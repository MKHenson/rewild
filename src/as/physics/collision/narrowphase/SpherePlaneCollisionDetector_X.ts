import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Vec3 } from "../../math/Vec3";
import { Sphere } from "../../shape/Sphere";
import { Plane } from "../../shape/Plane";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Shape } from "../../shape/Shape";

/**
 * A collision detector which detects collisions between two spheres.
 * @author saharan
 * @author lo-th
 */

export class SpherePlaneCollisionDetector extends CollisionDetector {
  n: Vec3;
  p: Vec3;

  constructor(flip: boolean) {
    super();

    this.flip = flip;

    this.n = new Vec3();
    this.p = new Vec3();
  }

  detectCollision(shape1: Shape, shape2: Shape, manifold: ContactManifold): void {
    let n = this.n;
    let p = this.p;

    let s: Sphere = this.flip ? (shape2 as Sphere) : (shape1 as Sphere);
    let pn: Plane = this.flip ? (shape1 as Plane) : (shape2 as Plane);
    let rad = s.radius;
    let len: f32 = 0;

    n.sub(s.position, pn.position);
    //let h = _Math.dotVectors( pn.normal, n );

    n.x *= pn.normal.x; //+ rad;
    n.y *= pn.normal.y;
    n.z *= pn.normal.z; //+ rad;

    len = n.lengthSq();

    if (len > 0 && len < rad * rad) {
      //&& h > rad*rad ){

      len = Mathf.sqrt(len);
      //len = _Math.sqrt( h );
      n.copy(pn.normal).negate();
      //n.scaleEqual( 1/len );

      //(0, -1, 0)

      //n.normalize();
      p.copy(s.position).addScaledVector(n, rad);
      manifold.addPointVec(p, n, len - rad, this.flip);
    }
  }
}
