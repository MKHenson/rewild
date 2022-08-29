import { CollisionDetector } from "./CollisionDetector";
import { _Math } from "../../math/Math";
import { Vec3 } from "../../math/Vec3";
import { Box } from "../../shape/Box";
import { Cylinder } from "../../shape/Cylinder";
import { ManifoldPoint } from "../../constraint/contact/ManifoldPoint";
import { ContactManifold } from "../../constraint/contact/ContactManifold";
import { Shape } from "../../shape/Shape";

export class BoxCylinderCollisionDetector extends CollisionDetector {
  flip: boolean;

  constructor(flip: boolean) {
    super();
    this.flip = flip;
  }

  getSep(c1: Box, c2: Cylinder, sep: Vec3, pos: Vec3, dep: Vec3) {
    let t1x: f32 = 0;
    let t1y: f32 = 0;
    let t1z: f32 = 0;
    let t2x: f32 = 0;
    let t2y: f32 = 0;
    let t2z: f32 = 0;
    let sup = new Vec3();
    let len: f32 = 0;
    let p1x: f32 = 0;
    let p1y: f32 = 0;
    let p1z: f32 = 0;
    let p2x: f32 = 0;
    let p2y: f32 = 0;
    let p2z: f32 = 0;
    let v01x = c1.position.x;
    let v01y = c1.position.y;
    let v01z = c1.position.z;
    let v02x = c2.position.x;
    let v02y = c2.position.y;
    let v02z = c2.position.z;
    let v0x = v02x - v01x;
    let v0y = v02y - v01y;
    let v0z = v02z - v01z;
    if (v0x * v0x + v0y * v0y + v0z * v0z == 0) v0y = 0.001;
    let nx = -v0x;
    let ny = -v0y;
    let nz = -v0z;
    this.supportPointB(c1, -nx, -ny, -nz, sup);
    let v11x = sup.x;
    let v11y = sup.y;
    let v11z = sup.z;
    this.supportPointC(c2, nx, ny, nz, sup);
    let v12x = sup.x;
    let v12y = sup.y;
    let v12z = sup.z;
    let v1x = v12x - v11x;
    let v1y = v12y - v11y;
    let v1z = v12z - v11z;
    if (v1x * nx + v1y * ny + v1z * nz <= 0) {
      return false;
    }
    nx = v1y * v0z - v1z * v0y;
    ny = v1z * v0x - v1x * v0z;
    nz = v1x * v0y - v1y * v0x;
    if (nx * nx + ny * ny + nz * nz == 0) {
      sep.set(v1x - v0x, v1y - v0y, v1z - v0z).normalize();
      pos.set((v11x + v12x) * 0.5, (v11y + v12y) * 0.5, (v11z + v12z) * 0.5);
      return true;
    }
    this.supportPointB(c1, -nx, -ny, -nz, sup);
    let v21x = sup.x;
    let v21y = sup.y;
    let v21z = sup.z;
    this.supportPointC(c2, nx, ny, nz, sup);
    let v22x = sup.x;
    let v22y = sup.y;
    let v22z = sup.z;
    let v2x = v22x - v21x;
    let v2y = v22y - v21y;
    let v2z = v22z - v21z;
    if (v2x * nx + v2y * ny + v2z * nz <= 0) {
      return false;
    }
    t1x = v1x - v0x;
    t1y = v1y - v0y;
    t1z = v1z - v0z;
    t2x = v2x - v0x;
    t2y = v2y - v0y;
    t2z = v2z - v0z;
    nx = t1y * t2z - t1z * t2y;
    ny = t1z * t2x - t1x * t2z;
    nz = t1x * t2y - t1y * t2x;
    if (nx * v0x + ny * v0y + nz * v0z > 0) {
      t1x = v1x;
      t1y = v1y;
      t1z = v1z;
      v1x = v2x;
      v1y = v2y;
      v1z = v2z;
      v2x = t1x;
      v2y = t1y;
      v2z = t1z;
      t1x = v11x;
      t1y = v11y;
      t1z = v11z;
      v11x = v21x;
      v11y = v21y;
      v11z = v21z;
      v21x = t1x;
      v21y = t1y;
      v21z = t1z;
      t1x = v12x;
      t1y = v12y;
      t1z = v12z;
      v12x = v22x;
      v12y = v22y;
      v12z = v22z;
      v22x = t1x;
      v22y = t1y;
      v22z = t1z;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    let iterations = 0;
    while (true) {
      if (++iterations > 100) {
        return false;
      }
      this.supportPointB(c1, -nx, -ny, -nz, sup);
      let v31x = sup.x;
      let v31y = sup.y;
      let v31z = sup.z;
      this.supportPointC(c2, nx, ny, nz, sup);
      let v32x = sup.x;
      let v32y = sup.y;
      let v32z = sup.z;
      let v3x = v32x - v31x;
      let v3y = v32y - v31y;
      let v3z = v32z - v31z;
      if (v3x * nx + v3y * ny + v3z * nz <= 0) {
        return false;
      }
      if ((v1y * v3z - v1z * v3y) * v0x + (v1z * v3x - v1x * v3z) * v0y + (v1x * v3y - v1y * v3x) * v0z < 0) {
        v2x = v3x;
        v2y = v3y;
        v2z = v3z;
        v21x = v31x;
        v21y = v31y;
        v21z = v31z;
        v22x = v32x;
        v22y = v32y;
        v22z = v32z;
        t1x = v1x - v0x;
        t1y = v1y - v0y;
        t1z = v1z - v0z;
        t2x = v3x - v0x;
        t2y = v3y - v0y;
        t2z = v3z - v0z;
        nx = t1y * t2z - t1z * t2y;
        ny = t1z * t2x - t1x * t2z;
        nz = t1x * t2y - t1y * t2x;
        continue;
      }
      if ((v3y * v2z - v3z * v2y) * v0x + (v3z * v2x - v3x * v2z) * v0y + (v3x * v2y - v3y * v2x) * v0z < 0) {
        v1x = v3x;
        v1y = v3y;
        v1z = v3z;
        v11x = v31x;
        v11y = v31y;
        v11z = v31z;
        v12x = v32x;
        v12y = v32y;
        v12z = v32z;
        t1x = v3x - v0x;
        t1y = v3y - v0y;
        t1z = v3z - v0z;
        t2x = v2x - v0x;
        t2y = v2y - v0y;
        t2z = v2z - v0z;
        nx = t1y * t2z - t1z * t2y;
        ny = t1z * t2x - t1x * t2z;
        nz = t1x * t2y - t1y * t2x;
        continue;
      }
      let hit = false;
      while (true) {
        t1x = v2x - v1x;
        t1y = v2y - v1y;
        t1z = v2z - v1z;
        t2x = v3x - v1x;
        t2y = v3y - v1y;
        t2z = v3z - v1z;
        nx = t1y * t2z - t1z * t2y;
        ny = t1z * t2x - t1x * t2z;
        nz = t1x * t2y - t1y * t2x;
        len = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= len;
        ny *= len;
        nz *= len;
        if (nx * v1x + ny * v1y + nz * v1z >= 0 && !hit) {
          let b0 = (v1y * v2z - v1z * v2y) * v3x + (v1z * v2x - v1x * v2z) * v3y + (v1x * v2y - v1y * v2x) * v3z;
          let b1 = (v3y * v2z - v3z * v2y) * v0x + (v3z * v2x - v3x * v2z) * v0y + (v3x * v2y - v3y * v2x) * v0z;
          let b2 = (v0y * v1z - v0z * v1y) * v3x + (v0z * v1x - v0x * v1z) * v3y + (v0x * v1y - v0y * v1x) * v3z;
          let b3 = (v2y * v1z - v2z * v1y) * v0x + (v2z * v1x - v2x * v1z) * v0y + (v2x * v1y - v2y * v1x) * v0z;
          let sum = b0 + b1 + b2 + b3;
          if (sum <= 0) {
            b0 = 0;
            b1 = (v2y * v3z - v2z * v3y) * nx + (v2z * v3x - v2x * v3z) * ny + (v2x * v3y - v2y * v3x) * nz;
            b2 = (v3y * v2z - v3z * v2y) * nx + (v3z * v2x - v3x * v2z) * ny + (v3x * v2y - v3y * v2x) * nz;
            b3 = (v1y * v2z - v1z * v2y) * nx + (v1z * v2x - v1x * v2z) * ny + (v1x * v2y - v1y * v2x) * nz;
            sum = b1 + b2 + b3;
          }
          let inv = 1 / sum;
          p1x = (v01x * b0 + v11x * b1 + v21x * b2 + v31x * b3) * inv;
          p1y = (v01y * b0 + v11y * b1 + v21y * b2 + v31y * b3) * inv;
          p1z = (v01z * b0 + v11z * b1 + v21z * b2 + v31z * b3) * inv;
          p2x = (v02x * b0 + v12x * b1 + v22x * b2 + v32x * b3) * inv;
          p2y = (v02y * b0 + v12y * b1 + v22y * b2 + v32y * b3) * inv;
          p2z = (v02z * b0 + v12z * b1 + v22z * b2 + v32z * b3) * inv;
          hit = true;
        }
        this.supportPointB(c1, -nx, -ny, -nz, sup);
        let v41x = sup.x;
        let v41y = sup.y;
        let v41z = sup.z;
        this.supportPointC(c2, nx, ny, nz, sup);
        let v42x = sup.x;
        let v42y = sup.y;
        let v42z = sup.z;
        let v4x = v42x - v41x;
        let v4y = v42y - v41y;
        let v4z = v42z - v41z;
        let separation = -(v4x * nx + v4y * ny + v4z * nz);
        if ((v4x - v3x) * nx + (v4y - v3y) * ny + (v4z - v3z) * nz <= 0.01 || separation >= 0) {
          if (hit) {
            sep.set(-nx, -ny, -nz);
            pos.set((p1x + p2x) * 0.5, (p1y + p2y) * 0.5, (p1z + p2z) * 0.5);
            dep.x = separation;
            return true;
          }
          return false;
        }
        if ((v4y * v1z - v4z * v1y) * v0x + (v4z * v1x - v4x * v1z) * v0y + (v4x * v1y - v4y * v1x) * v0z < 0) {
          if ((v4y * v2z - v4z * v2y) * v0x + (v4z * v2x - v4x * v2z) * v0y + (v4x * v2y - v4y * v2x) * v0z < 0) {
            v1x = v4x;
            v1y = v4y;
            v1z = v4z;
            v11x = v41x;
            v11y = v41y;
            v11z = v41z;
            v12x = v42x;
            v12y = v42y;
            v12z = v42z;
          } else {
            v3x = v4x;
            v3y = v4y;
            v3z = v4z;
            v31x = v41x;
            v31y = v41y;
            v31z = v41z;
            v32x = v42x;
            v32y = v42y;
            v32z = v42z;
          }
        } else {
          if ((v4y * v3z - v4z * v3y) * v0x + (v4z * v3x - v4x * v3z) * v0y + (v4x * v3y - v4y * v3x) * v0z < 0) {
            v2x = v4x;
            v2y = v4y;
            v2z = v4z;
            v21x = v41x;
            v21y = v41y;
            v21z = v41z;
            v22x = v42x;
            v22y = v42y;
            v22z = v42z;
          } else {
            v1x = v4x;
            v1y = v4y;
            v1z = v4z;
            v11x = v41x;
            v11y = v41y;
            v11z = v41z;
            v12x = v42x;
            v12y = v42y;
            v12z = v42z;
          }
        }
      }
    }
    //return false;
  }

  supportPointB(c: Box, dx: f32, dy: f32, dz: f32, out: Vec3) {
    let rot = c.rotation.elements;
    let ldx = rot[0] * dx + rot[3] * dy + rot[6] * dz;
    let ldy = rot[1] * dx + rot[4] * dy + rot[7] * dz;
    let ldz = rot[2] * dx + rot[5] * dy + rot[8] * dz;
    let w = c.halfWidth;
    let h = c.halfHeight;
    let d = c.halfDepth;
    let ox;
    let oy;
    let oz;
    if (ldx < 0) ox = -w;
    else ox = w;
    if (ldy < 0) oy = -h;
    else oy = h;
    if (ldz < 0) oz = -d;
    else oz = d;
    ldx = rot[0] * ox + rot[1] * oy + rot[2] * oz + c.position.x;
    ldy = rot[3] * ox + rot[4] * oy + rot[5] * oz + c.position.y;
    ldz = rot[6] * ox + rot[7] * oy + rot[8] * oz + c.position.z;
    out.set(ldx, ldy, ldz);
  }

  supportPointC(c: Cylinder, dx: f32, dy: f32, dz: f32, out: Vec3) {
    let rot = c.rotation.elements;
    let ldx = rot[0] * dx + rot[3] * dy + rot[6] * dz;
    let ldy = rot[1] * dx + rot[4] * dy + rot[7] * dz;
    let ldz = rot[2] * dx + rot[5] * dy + rot[8] * dz;
    let radx = ldx;
    let radz = ldz;
    let len = radx * radx + radz * radz;
    let rad = c.radius;
    let hh = c.halfHeight;
    let ox: f32 = 0;
    let oy: f32 = 0;
    let oz: f32 = 0;
    if (len == 0) {
      if (ldy < 0) {
        ox = rad;
        oy = -hh;
        oz = 0;
      } else {
        ox = rad;
        oy = hh;
        oz = 0;
      }
    } else {
      len = c.radius / Math.sqrt(len);
      if (ldy < 0) {
        ox = radx * len;
        oy = -hh;
        oz = radz * len;
      } else {
        ox = radx * len;
        oy = hh;
        oz = radz * len;
      }
    }
    ldx = rot[0] * ox + rot[1] * oy + rot[2] * oz + c.position.x;
    ldy = rot[3] * ox + rot[4] * oy + rot[5] * oz + c.position.y;
    ldz = rot[6] * ox + rot[7] * oy + rot[8] * oz + c.position.z;
    out.set(ldx, ldy, ldz);
  }

  detectCollision(shape1: Shape, shape2: Shape, manifold: ContactManifold) {
    let b: Box;
    let c: Cylinder;
    if (this.flip) {
      b = shape2 as Box;
      c = shape1 as Cylinder;
    } else {
      b = shape1 as Box;
      c = shape2 as Cylinder;
    }
    let sep = new Vec3();
    let pos = new Vec3();
    let dep = new Vec3();

    if (!this.getSep(b, c, sep, pos, dep)) return;
    let pbx = b.position.x;
    let pby = b.position.y;
    let pbz = b.position.z;
    let pcx = c.position.x;
    let pcy = c.position.y;
    let pcz = c.position.z;
    let bw = b.halfWidth;
    let bh = b.halfHeight;
    let bd = b.halfDepth;
    let ch = c.halfHeight;
    let r = c.radius;

    let D = b.dimentions;

    let nwx = D[0]; //b.normalDirectionWidth.x;
    let nwy = D[1]; //b.normalDirectionWidth.y;
    let nwz = D[2]; //b.normalDirectionWidth.z;
    let nhx = D[3]; //b.normalDirectionHeight.x;
    let nhy = D[4]; //b.normalDirectionHeight.y;
    let nhz = D[5]; //b.normalDirectionHeight.z;
    let ndx = D[6]; //b.normalDirectionDepth.x;
    let ndy = D[7]; //b.normalDirectionDepth.y;
    let ndz = D[8]; //b.normalDirectionDepth.z;

    let dwx = D[9]; //b.halfDirectionWidth.x;
    let dwy = D[10]; //b.halfDirectionWidth.y;
    let dwz = D[11]; //b.halfDirectionWidth.z;
    let dhx = D[12]; //b.halfDirectionHeight.x;
    let dhy = D[13]; //b.halfDirectionHeight.y;
    let dhz = D[14]; //b.halfDirectionHeight.z;
    let ddx = D[15]; //b.halfDirectionDepth.x;
    let ddy = D[16]; //b.halfDirectionDepth.y;
    let ddz = D[17]; //b.halfDirectionDepth.z;

    let ncx = c.normalDirection.x;
    let ncy = c.normalDirection.y;
    let ncz = c.normalDirection.z;
    let dcx = c.halfDirection.x;
    let dcy = c.halfDirection.y;
    let dcz = c.halfDirection.z;
    let nx = sep.x;
    let ny = sep.y;
    let nz = sep.z;
    let dotw = nx * nwx + ny * nwy + nz * nwz;
    let doth = nx * nhx + ny * nhy + nz * nhz;
    let dotd = nx * ndx + ny * ndy + nz * ndz;
    let dotc = nx * ncx + ny * ncy + nz * ncz;
    let right1 = dotw > 0;
    let right2 = doth > 0;
    let right3 = dotd > 0;
    let right4 = dotc > 0;
    if (!right1) dotw = -dotw;
    if (!right2) doth = -doth;
    if (!right3) dotd = -dotd;
    if (!right4) dotc = -dotc;
    let state = 0;
    if (dotc > 0.999) {
      if (dotw > 0.999) {
        if (dotw > dotc) state = 1;
        else state = 4;
      } else if (doth > 0.999) {
        if (doth > dotc) state = 2;
        else state = 4;
      } else if (dotd > 0.999) {
        if (dotd > dotc) state = 3;
        else state = 4;
      } else state = 4;
    } else {
      if (dotw > 0.999) state = 1;
      else if (doth > 0.999) state = 2;
      else if (dotd > 0.999) state = 3;
    }
    let cbx: f32 = 0;
    let cby: f32 = 0;
    let cbz: f32 = 0;
    let ccx: f32 = 0;
    let ccy: f32 = 0;
    let ccz: f32 = 0;
    let r00: f32 = 0;
    let r01: f32 = 0;
    let r02: f32 = 0;
    let r10: f32 = 0;
    let r11: f32 = 0;
    let r12: f32 = 0;
    let r20: f32 = 0;
    let r21: f32 = 0;
    let r22: f32 = 0;
    let px: f32 = 0;
    let py: f32 = 0;
    let pz: f32 = 0;
    let pd: f32 = 0;
    let dot: f32 = 0;
    let len: f32 = 0;
    let tx: f32 = 0;
    let ty: f32 = 0;
    let tz: f32 = 0;
    let td: f32 = 0;
    let dx: f32 = 0;
    let dy: f32 = 0;
    let dz: f32 = 0;
    let d1x: f32 = 0;
    let d1y: f32 = 0;
    let d1z: f32 = 0;
    let d2x: f32 = 0;
    let d2y: f32 = 0;
    let d2z: f32 = 0;
    let sx: f32 = 0;
    let sy: f32 = 0;
    let sz: f32 = 0;
    let sd: f32 = 0;
    let ex: f32 = 0;
    let ey: f32 = 0;
    let ez: f32 = 0;
    let ed: f32 = 0;
    let dot1: f32 = 0;
    let dot2: f32 = 0;
    let t1: f32 = 0;
    let dir1x: f32 = 0;
    let dir1y: f32 = 0;
    let dir1z: f32 = 0;
    let dir2x: f32 = 0;
    let dir2y: f32 = 0;
    let dir2z: f32 = 0;
    let dir1l: f32 = 0;
    let dir2l: f32 = 0;
    if (state == 0) {
      //manifold.addPoint(pos.x,pos.y,pos.z,nx,ny,nz,dep.x,b,c,0,0,false);
      manifold.addPoint(pos.x, pos.y, pos.z, nx, ny, nz, dep.x, this.flip);
    } else if (state == 4) {
      if (right4) {
        ccx = pcx - dcx;
        ccy = pcy - dcy;
        ccz = pcz - dcz;
        nx = -ncx;
        ny = -ncy;
        nz = -ncz;
      } else {
        ccx = pcx + dcx;
        ccy = pcy + dcy;
        ccz = pcz + dcz;
        nx = ncx;
        ny = ncy;
        nz = ncz;
      }
      let v1x: f32 = 0;
      let v1y: f32 = 0;
      let v1z: f32 = 0;
      let v2x: f32 = 0;
      let v2y: f32 = 0;
      let v2z: f32 = 0;
      let v3x: f32 = 0;
      let v3y: f32 = 0;
      let v3z: f32 = 0;
      let v4x: f32 = 0;
      let v4y: f32 = 0;
      let v4z: f32 = 0;

      dot = 1;
      state = 0;
      dot1 = nwx * nx + nwy * ny + nwz * nz;
      if (dot1 < dot) {
        dot = dot1;
        state = 0;
      }
      if (-dot1 < dot) {
        dot = -dot1;
        state = 1;
      }
      dot1 = nhx * nx + nhy * ny + nhz * nz;
      if (dot1 < dot) {
        dot = dot1;
        state = 2;
      }
      if (-dot1 < dot) {
        dot = -dot1;
        state = 3;
      }
      dot1 = ndx * nx + ndy * ny + ndz * nz;
      if (dot1 < dot) {
        dot = dot1;
        state = 4;
      }
      if (-dot1 < dot) {
        dot = -dot1;
        state = 5;
      }
      let v = b.elements;
      switch (state) {
        case 0:
          //v=b.vertex1;
          v1x = v[0]; //v.x;
          v1y = v[1]; //v.y;
          v1z = v[2]; //v.z;
          //v=b.vertex3;
          v2x = v[6]; //v.x;
          v2y = v[7]; //v.y;
          v2z = v[8]; //v.z;
          //v=b.vertex4;
          v3x = v[9]; //v.x;
          v3y = v[10]; //v.y;
          v3z = v[11]; //v.z;
          //v=b.vertex2;
          v4x = v[3]; //v.x;
          v4y = v[4]; //v.y;
          v4z = v[5]; //v.z;
          break;
        case 1:
          //v=b.vertex6;
          v1x = v[15]; //v.x;
          v1y = v[16]; //v.y;
          v1z = v[17]; //v.z;
          //v=b.vertex8;
          v2x = v[21]; //v.x;
          v2y = v[22]; //v.y;
          v2z = v[23]; //v.z;
          //v=b.vertex7;
          v3x = v[18]; //v.x;
          v3y = v[19]; //v.y;
          v3z = v[20]; //v.z;
          //v=b.vertex5;
          v4x = v[12]; //v.x;
          v4y = v[13]; //v.y;
          v4z = v[14]; //v.z;
          break;
        case 2:
          //v=b.vertex5;
          v1x = v[12]; //v.x;
          v1y = v[13]; //v.y;
          v1z = v[14]; //v.z;
          //v=b.vertex1;
          v2x = v[0]; //v.x;
          v2y = v[1]; //v.y;
          v2z = v[2]; //v.z;
          //v=b.vertex2;
          v3x = v[3]; //v.x;
          v3y = v[4]; //v.y;
          v3z = v[5]; //v.z;
          //v=b.vertex6;
          v4x = v[15]; //v.x;
          v4y = v[16]; //v.y;
          v4z = v[17]; //v.z;
          break;
        case 3:
          //v=b.vertex8;
          v1x = v[21]; //v.x;
          v1y = v[22]; //v.y;
          v1z = v[23]; //v.z;
          //v=b.vertex4;
          v2x = v[9]; //v.x;
          v2y = v[10]; //v.y;
          v2z = v[11]; //v.z;
          //v=b.vertex3;
          v3x = v[6]; //v.x;
          v3y = v[7]; //v.y;
          v3z = v[8]; //v.z;
          //v=b.vertex7;
          v4x = v[18]; //v.x;
          v4y = v[19]; //v.y;
          v4z = v[20]; //v.z;
          break;
        case 4:
          //v=b.vertex5;
          v1x = v[12]; //v.x;
          v1y = v[13]; //v.y;
          v1z = v[14]; //v.z;
          //v=b.vertex7;
          v2x = v[18]; //v.x;
          v2y = v[19]; //v.y;
          v2z = v[20]; //v.z;
          //v=b.vertex3;
          v3x = v[6]; //v.x;
          v3y = v[7]; //v.y;
          v3z = v[8]; //v.z;
          //v=b.vertex1;
          v4x = v[0]; //v.x;
          v4y = v[1]; //v.y;
          v4z = v[2]; //v.z;
          break;
        case 5:
          //v=b.vertex2;
          v1x = v[3]; //v.x;
          v1y = v[4]; //v.y;
          v1z = v[5]; //v.z;
          //v=b.vertex4;
          v2x = v[9]; //v.x;
          v2y = v[10]; //v.y;
          v2z = v[11]; //v.z;
          //v=b.vertex8;
          v3x = v[21]; //v.x;
          v3y = v[22]; //v.y;
          v3z = v[23]; //v.z;
          //v=b.vertex6;
          v4x = v[15]; //v.x;
          v4y = v[16]; //v.y;
          v4z = v[17]; //v.z;
          break;
      }
      pd = nx * (v1x - ccx) + ny * (v1y - ccy) + nz * (v1z - ccz);
      if (pd <= 0) manifold.addPoint(v1x, v1y, v1z, -nx, -ny, -nz, pd, this.flip);
      pd = nx * (v2x - ccx) + ny * (v2y - ccy) + nz * (v2z - ccz);
      if (pd <= 0) manifold.addPoint(v2x, v2y, v2z, -nx, -ny, -nz, pd, this.flip);
      pd = nx * (v3x - ccx) + ny * (v3y - ccy) + nz * (v3z - ccz);
      if (pd <= 0) manifold.addPoint(v3x, v3y, v3z, -nx, -ny, -nz, pd, this.flip);
      pd = nx * (v4x - ccx) + ny * (v4y - ccy) + nz * (v4z - ccz);
      if (pd <= 0) manifold.addPoint(v4x, v4y, v4z, -nx, -ny, -nz, pd, this.flip);
    } else {
      switch (state) {
        case 1:
          if (right1) {
            cbx = pbx + dwx;
            cby = pby + dwy;
            cbz = pbz + dwz;
            nx = nwx;
            ny = nwy;
            nz = nwz;
          } else {
            cbx = pbx - dwx;
            cby = pby - dwy;
            cbz = pbz - dwz;
            nx = -nwx;
            ny = -nwy;
            nz = -nwz;
          }
          dir1x = nhx;
          dir1y = nhy;
          dir1z = nhz;
          dir1l = bh;
          dir2x = ndx;
          dir2y = ndy;
          dir2z = ndz;
          dir2l = bd;
          break;
        case 2:
          if (right2) {
            cbx = pbx + dhx;
            cby = pby + dhy;
            cbz = pbz + dhz;
            nx = nhx;
            ny = nhy;
            nz = nhz;
          } else {
            cbx = pbx - dhx;
            cby = pby - dhy;
            cbz = pbz - dhz;
            nx = -nhx;
            ny = -nhy;
            nz = -nhz;
          }
          dir1x = nwx;
          dir1y = nwy;
          dir1z = nwz;
          dir1l = bw;
          dir2x = ndx;
          dir2y = ndy;
          dir2z = ndz;
          dir2l = bd;
          break;
        case 3:
          if (right3) {
            cbx = pbx + ddx;
            cby = pby + ddy;
            cbz = pbz + ddz;
            nx = ndx;
            ny = ndy;
            nz = ndz;
          } else {
            cbx = pbx - ddx;
            cby = pby - ddy;
            cbz = pbz - ddz;
            nx = -ndx;
            ny = -ndy;
            nz = -ndz;
          }
          dir1x = nwx;
          dir1y = nwy;
          dir1z = nwz;
          dir1l = bw;
          dir2x = nhx;
          dir2y = nhy;
          dir2z = nhz;
          dir2l = bh;
          break;
      }
      dot = nx * ncx + ny * ncy + nz * ncz;
      if (dot < 0) len = ch;
      else len = -ch;
      ccx = pcx + len * ncx;
      ccy = pcy + len * ncy;
      ccz = pcz + len * ncz;
      if (dotc >= 0.999999) {
        tx = -ny;
        ty = nz;
        tz = nx;
      } else {
        tx = nx;
        ty = ny;
        tz = nz;
      }
      len = tx * ncx + ty * ncy + tz * ncz;
      dx = len * ncx - tx;
      dy = len * ncy - ty;
      dz = len * ncz - tz;
      len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len == 0) return;
      len = r / len;
      dx *= len;
      dy *= len;
      dz *= len;
      tx = ccx + dx;
      ty = ccy + dy;
      tz = ccz + dz;
      if (dot < -0.96 || dot > 0.96) {
        r00 = ncx * ncx * 1.5 - 0.5;
        r01 = ncx * ncy * 1.5 - ncz * 0.866025403;
        r02 = ncx * ncz * 1.5 + ncy * 0.866025403;
        r10 = ncy * ncx * 1.5 + ncz * 0.866025403;
        r11 = ncy * ncy * 1.5 - 0.5;
        r12 = ncy * ncz * 1.5 - ncx * 0.866025403;
        r20 = ncz * ncx * 1.5 - ncy * 0.866025403;
        r21 = ncz * ncy * 1.5 + ncx * 0.866025403;
        r22 = ncz * ncz * 1.5 - 0.5;
        px = tx;
        py = ty;
        pz = tz;
        pd = nx * (px - cbx) + ny * (py - cby) + nz * (pz - cbz);
        tx = px - pd * nx - cbx;
        ty = py - pd * ny - cby;
        tz = pz - pd * nz - cbz;
        sd = dir1x * tx + dir1y * ty + dir1z * tz;
        ed = dir2x * tx + dir2y * ty + dir2z * tz;
        if (sd < -dir1l) sd = -dir1l;
        else if (sd > dir1l) sd = dir1l;
        if (ed < -dir2l) ed = -dir2l;
        else if (ed > dir2l) ed = dir2l;
        tx = sd * dir1x + ed * dir2x;
        ty = sd * dir1y + ed * dir2y;
        tz = sd * dir1z + ed * dir2z;
        px = cbx + tx;
        py = cby + ty;
        pz = cbz + tz;
        manifold.addPoint(px, py, pz, nx, ny, nz, pd, this.flip);
        px = dx * r00 + dy * r01 + dz * r02;
        py = dx * r10 + dy * r11 + dz * r12;
        pz = dx * r20 + dy * r21 + dz * r22;
        px = (dx = px) + ccx;
        py = (dy = py) + ccy;
        pz = (dz = pz) + ccz;
        pd = nx * (px - cbx) + ny * (py - cby) + nz * (pz - cbz);
        if (pd <= 0) {
          tx = px - pd * nx - cbx;
          ty = py - pd * ny - cby;
          tz = pz - pd * nz - cbz;
          sd = dir1x * tx + dir1y * ty + dir1z * tz;
          ed = dir2x * tx + dir2y * ty + dir2z * tz;
          if (sd < -dir1l) sd = -dir1l;
          else if (sd > dir1l) sd = dir1l;
          if (ed < -dir2l) ed = -dir2l;
          else if (ed > dir2l) ed = dir2l;
          tx = sd * dir1x + ed * dir2x;
          ty = sd * dir1y + ed * dir2y;
          tz = sd * dir1z + ed * dir2z;
          px = cbx + tx;
          py = cby + ty;
          pz = cbz + tz;
          //manifold.addPoint(px,py,pz,nx,ny,nz,pd,b,c,2,0,false);
          manifold.addPoint(px, py, pz, nx, ny, nz, pd, this.flip);
        }
        px = dx * r00 + dy * r01 + dz * r02;
        py = dx * r10 + dy * r11 + dz * r12;
        pz = dx * r20 + dy * r21 + dz * r22;
        px = (dx = px) + ccx;
        py = (dy = py) + ccy;
        pz = (dz = pz) + ccz;
        pd = nx * (px - cbx) + ny * (py - cby) + nz * (pz - cbz);
        if (pd <= 0) {
          tx = px - pd * nx - cbx;
          ty = py - pd * ny - cby;
          tz = pz - pd * nz - cbz;
          sd = dir1x * tx + dir1y * ty + dir1z * tz;
          ed = dir2x * tx + dir2y * ty + dir2z * tz;
          if (sd < -dir1l) sd = -dir1l;
          else if (sd > dir1l) sd = dir1l;
          if (ed < -dir2l) ed = -dir2l;
          else if (ed > dir2l) ed = dir2l;
          tx = sd * dir1x + ed * dir2x;
          ty = sd * dir1y + ed * dir2y;
          tz = sd * dir1z + ed * dir2z;
          px = cbx + tx;
          py = cby + ty;
          pz = cbz + tz;
          //manifold.addPoint(px,py,pz,nx,ny,nz,pd,b,c,3,0,false);
          manifold.addPoint(px, py, pz, nx, ny, nz, pd, this.flip);
        }
      } else {
        sx = tx;
        sy = ty;
        sz = tz;
        sd = nx * (sx - cbx) + ny * (sy - cby) + nz * (sz - cbz);
        sx -= sd * nx;
        sy -= sd * ny;
        sz -= sd * nz;
        if (dot > 0) {
          ex = tx + dcx * 2;
          ey = ty + dcy * 2;
          ez = tz + dcz * 2;
        } else {
          ex = tx - dcx * 2;
          ey = ty - dcy * 2;
          ez = tz - dcz * 2;
        }
        ed = nx * (ex - cbx) + ny * (ey - cby) + nz * (ez - cbz);
        ex -= ed * nx;
        ey -= ed * ny;
        ez -= ed * nz;
        d1x = sx - cbx;
        d1y = sy - cby;
        d1z = sz - cbz;
        d2x = ex - cbx;
        d2y = ey - cby;
        d2z = ez - cbz;
        tx = ex - sx;
        ty = ey - sy;
        tz = ez - sz;
        td = ed - sd;
        dotw = d1x * dir1x + d1y * dir1y + d1z * dir1z;
        doth = d2x * dir1x + d2y * dir1y + d2z * dir1z;
        dot1 = dotw - dir1l;
        dot2 = doth - dir1l;
        if (dot1 > 0) {
          if (dot2 > 0) return;
          t1 = dot1 / (dot1 - dot2);
          sx = sx + tx * t1;
          sy = sy + ty * t1;
          sz = sz + tz * t1;
          sd = sd + td * t1;
          d1x = sx - cbx;
          d1y = sy - cby;
          d1z = sz - cbz;
          dotw = d1x * dir1x + d1y * dir1y + d1z * dir1z;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        } else if (dot2 > 0) {
          t1 = dot1 / (dot1 - dot2);
          ex = sx + tx * t1;
          ey = sy + ty * t1;
          ez = sz + tz * t1;
          ed = sd + td * t1;
          d2x = ex - cbx;
          d2y = ey - cby;
          d2z = ez - cbz;
          doth = d2x * dir1x + d2y * dir1y + d2z * dir1z;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        }
        dot1 = dotw + dir1l;
        dot2 = doth + dir1l;
        if (dot1 < 0) {
          if (dot2 < 0) return;
          t1 = dot1 / (dot1 - dot2);
          sx = sx + tx * t1;
          sy = sy + ty * t1;
          sz = sz + tz * t1;
          sd = sd + td * t1;
          d1x = sx - cbx;
          d1y = sy - cby;
          d1z = sz - cbz;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        } else if (dot2 < 0) {
          t1 = dot1 / (dot1 - dot2);
          ex = sx + tx * t1;
          ey = sy + ty * t1;
          ez = sz + tz * t1;
          ed = sd + td * t1;
          d2x = ex - cbx;
          d2y = ey - cby;
          d2z = ez - cbz;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        }
        dotw = d1x * dir2x + d1y * dir2y + d1z * dir2z;
        doth = d2x * dir2x + d2y * dir2y + d2z * dir2z;
        dot1 = dotw - dir2l;
        dot2 = doth - dir2l;
        if (dot1 > 0) {
          if (dot2 > 0) return;
          t1 = dot1 / (dot1 - dot2);
          sx = sx + tx * t1;
          sy = sy + ty * t1;
          sz = sz + tz * t1;
          sd = sd + td * t1;
          d1x = sx - cbx;
          d1y = sy - cby;
          d1z = sz - cbz;
          dotw = d1x * dir2x + d1y * dir2y + d1z * dir2z;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        } else if (dot2 > 0) {
          t1 = dot1 / (dot1 - dot2);
          ex = sx + tx * t1;
          ey = sy + ty * t1;
          ez = sz + tz * t1;
          ed = sd + td * t1;
          d2x = ex - cbx;
          d2y = ey - cby;
          d2z = ez - cbz;
          doth = d2x * dir2x + d2y * dir2y + d2z * dir2z;
          tx = ex - sx;
          ty = ey - sy;
          tz = ez - sz;
          td = ed - sd;
        }
        dot1 = dotw + dir2l;
        dot2 = doth + dir2l;
        if (dot1 < 0) {
          if (dot2 < 0) return;
          t1 = dot1 / (dot1 - dot2);
          sx = sx + tx * t1;
          sy = sy + ty * t1;
          sz = sz + tz * t1;
          sd = sd + td * t1;
        } else if (dot2 < 0) {
          t1 = dot1 / (dot1 - dot2);
          ex = sx + tx * t1;
          ey = sy + ty * t1;
          ez = sz + tz * t1;
          ed = sd + td * t1;
        }
        if (sd < 0) {
          //manifold.addPoint(sx,sy,sz,nx,ny,nz,sd,b,c,1,0,false);
          manifold.addPoint(sx, sy, sz, nx, ny, nz, sd, this.flip);
        }
        if (ed < 0) {
          //manifold.addPoint(ex,ey,ez,nx,ny,nz,ed,b,c,4,0,false);
          manifold.addPoint(ex, ey, ez, nx, ny, nz, ed, this.flip);
        }
      }
    }
  }
}
