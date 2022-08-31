import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Shape } from "../../shape/Shape";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Sphere } from "../../shape/Sphere";
import { Box } from "../../shape/Box";

/**
 * A collision detector which detects collisions between sphere and box.
 * @author saharan
 */
export class SphereBoxCollisionDetector extends CollisionDetector {
  flip: boolean;

  constructor(flip: boolean) {
    super();
    this.flip = flip;
  }

  detectCollision(shape1: Shape, shape2: Shape, manifold: ContactManifold): void {
    let s: Sphere;
    let b: Box;

    if (this.flip) {
      s = shape2 as Sphere;
      b = shape1 as Box;
    } else {
      s = shape1 as Sphere;
      b = shape2 as Box;
    }

    let D = b.dimentions;

    let ps = s.position;
    let psx = ps.x;
    let psy = ps.y;
    let psz = ps.z;
    let pb = b.position;
    let pbx = pb.x;
    let pby = pb.y;
    let pbz = pb.z;
    let rad = s.radius;

    let hw = b.halfWidth;
    let hh = b.halfHeight;
    let hd = b.halfDepth;

    let dx = psx - pbx;
    let dy = psy - pby;
    let dz = psz - pbz;
    let sx = D[0] * dx + D[1] * dy + D[2] * dz;
    let sy = D[3] * dx + D[4] * dy + D[5] * dz;
    let sz = D[6] * dx + D[7] * dy + D[8] * dz;
    let cx: f32;
    let cy: f32;
    let cz: f32;
    let len: f32;
    let invLen: f32;
    let overlap = 0;
    if (sx > hw) {
      sx = hw;
    } else if (sx < -hw) {
      sx = -hw;
    } else {
      overlap = 1;
    }
    if (sy > hh) {
      sy = hh;
    } else if (sy < -hh) {
      sy = -hh;
    } else {
      overlap |= 2;
    }
    if (sz > hd) {
      sz = hd;
    } else if (sz < -hd) {
      sz = -hd;
    } else {
      overlap |= 4;
    }
    if (overlap == 7) {
      // center of sphere is in the box
      if (sx < 0) {
        dx = hw + sx;
      } else {
        dx = hw - sx;
      }
      if (sy < 0) {
        dy = hh + sy;
      } else {
        dy = hh - sy;
      }
      if (sz < 0) {
        dz = hd + sz;
      } else {
        dz = hd - sz;
      }
      if (dx < dy) {
        if (dx < dz) {
          len = dx - hw;
          if (sx < 0) {
            sx = -hw;
            dx = D[0];
            dy = D[1];
            dz = D[2];
          } else {
            sx = hw;
            dx = -D[0];
            dy = -D[1];
            dz = -D[2];
          }
        } else {
          len = dz - hd;
          if (sz < 0) {
            sz = -hd;
            dx = D[6];
            dy = D[7];
            dz = D[8];
          } else {
            sz = hd;
            dx = -D[6];
            dy = -D[7];
            dz = -D[8];
          }
        }
      } else {
        if (dy < dz) {
          len = dy - hh;
          if (sy < 0) {
            sy = -hh;
            dx = D[3];
            dy = D[4];
            dz = D[5];
          } else {
            sy = hh;
            dx = -D[3];
            dy = -D[4];
            dz = -D[5];
          }
        } else {
          len = dz - hd;
          if (sz < 0) {
            sz = -hd;
            dx = D[6];
            dy = D[7];
            dz = D[8];
          } else {
            sz = hd;
            dx = -D[6];
            dy = -D[7];
            dz = -D[8];
          }
        }
      }
      cx = pbx + sx * D[0] + sy * D[3] + sz * D[6];
      cy = pby + sx * D[1] + sy * D[4] + sz * D[7];
      cz = pbz + sx * D[2] + sy * D[5] + sz * D[8];
      manifold.addPoint(psx + rad * dx, psy + rad * dy, psz + rad * dz, dx, dy, dz, len - rad, this.flip);
    } else {
      cx = pbx + sx * D[0] + sy * D[3] + sz * D[6];
      cy = pby + sx * D[1] + sy * D[4] + sz * D[7];
      cz = pbz + sx * D[2] + sy * D[5] + sz * D[8];
      dx = cx - ps.x;
      dy = cy - ps.y;
      dz = cz - ps.z;
      len = dx * dx + dy * dy + dz * dz;
      if (len > 0 && len < rad * rad) {
        len = Mathf.sqrt(len);
        invLen = 1 / len;
        dx *= invLen;
        dy *= invLen;
        dz *= invLen;
        manifold.addPoint(psx + rad * dx, psy + rad * dy, psz + rad * dz, dx, dy, dz, len - rad, this.flip);
      }
    }
  }
}
