import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Shape } from "../../shape/Shape";
import { Sphere } from "../../shape/Sphere";
import { Cylinder } from "../../shape/Cylinder";

export class SphereCylinderCollisionDetector extends CollisionDetector {
  flip: boolean;

  constructor(flip: boolean) {
    super();
    this.flip = flip;
  }

  detectCollision(shape1: Shape, shape2: Shape, manifold: ContactManifold) {
    let s: Sphere;
    let c: Cylinder;

    if (this.flip) {
      s = shape2 as Sphere;
      c = shape1 as Cylinder;
    } else {
      s = shape1 as Sphere;
      c = shape2 as Cylinder;
    }

    let ps = s.position;
    let psx = ps.x;
    let psy = ps.y;
    let psz = ps.z;
    let pc = c.position;
    let pcx = pc.x;
    let pcy = pc.y;
    let pcz = pc.z;
    let dirx = c.normalDirection.x;
    let diry = c.normalDirection.y;
    let dirz = c.normalDirection.z;
    let rads = s.radius;
    let radc = c.radius;
    let rad2 = rads + radc;
    let halfh = c.halfHeight;
    let dx = psx - pcx;
    let dy = psy - pcy;
    let dz = psz - pcz;
    let dot = dx * dirx + dy * diry + dz * dirz;
    if (dot < -halfh - rads || dot > halfh + rads) return;
    let cx = pcx + dot * dirx;
    let cy = pcy + dot * diry;
    let cz = pcz + dot * dirz;
    let d2x = psx - cx;
    let d2y = psy - cy;
    let d2z = psz - cz;
    let len = d2x * d2x + d2y * d2y + d2z * d2z;
    if (len > rad2 * rad2) return;
    if (len > radc * radc) {
      len = radc / Math.sqrt(len);
      d2x *= len;
      d2y *= len;
      d2z *= len;
    }
    if (dot < -halfh) dot = -halfh;
    else if (dot > halfh) dot = halfh;
    cx = pcx + dot * dirx + d2x;
    cy = pcy + dot * diry + d2y;
    cz = pcz + dot * dirz + d2z;
    dx = cx - psx;
    dy = cy - psy;
    dz = cz - psz;
    len = dx * dx + dy * dy + dz * dz;
    let invLen;
    if (len > 0 && len < rads * rads) {
      len = Math.sqrt(len);
      invLen = 1 / len;
      dx *= invLen;
      dy *= invLen;
      dz *= invLen;
      ///result.addContactInfo(psx+dx*rads,psy+dy*rads,psz+dz*rads,dx,dy,dz,len-rads,s,c,0,0,false);
      manifold.addPoint(psx + dx * rads, psy + dy * rads, psz + dz * rads, dx, dy, dz, len - rads, this.flip);
    }
  }
}
