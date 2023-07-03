import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";
import { Plane } from "../shapes/Plane";
import { Shape } from "../shapes/Shape";
import { Sphere } from "../shapes/Sphere";
import { World } from "../world/World";
import { AABB } from "./AABB";
import { Broadphase } from "./Broadphase";

const GridBroadphase_collisionPairs_d = new Vec3();
// const GridBroadphase_collisionPairs_binPos = new Vec3();

export class GridBroadphase extends Broadphase {
  nx: f32;
  ny: f32;
  nz: f32;
  aabbMin: Vec3;
  aabbMax: Vec3;
  bins: Body[][];
  binLengths: i32[];

  /**
   * Axis aligned uniform grid broadphase.
   * @class GridBroadphase
   * @constructor
   * @extends Broadphase
   * @todo Needs support for more than just planes and spheres.
   * @param {Vec3} aabbMin
   * @param {Vec3} aabbMax
   * @param {Number} nx Number of boxes along x
   * @param {Number} ny Number of boxes along y
   * @param {Number} nz Number of boxes along z
   */
  constructor(
    aabbMin = new Vec3(100, 100, 100),
    aabbMax = new Vec3(-100, -100, -100),
    nx: f32 = 10,
    ny: f32 = 10,
    nz: f32 = 10
  ) {
    super();
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.aabbMin = aabbMin;
    this.aabbMax = aabbMax;
    const nbins = this.nx * this.ny * this.nz;
    if (nbins <= 0) {
      throw "GridBroadphase: Each dimension's n must be >0";
    }
    this.bins = [];
    this.binLengths = []; //Rather than continually resizing arrays (thrashing the memory), just record length and allow them to grow
    this.bins.length = nbins;
    this.binLengths.length = nbins;
    for (let i: i32 = 0; i < nbins; i++) {
      this.bins[i] = [];
      this.binLengths[i] = 0;
    }
  }

  aabbQuery(world: World, aabb: AABB, result: Body[]): Body[] {
    throw new Error("Method not implemented.");
  }

  /**
   * Get all the collision pairs in the physics world
   * @method collisionPairs
   * @param {World} world
   * @param {Array} pairs1
   * @param {Array} pairs2
   */
  collisionPairs(world: World, pairs1: Body[], pairs2: Body[]): void {
    const N = world.numObjects(),
      bodies = world.bodies;

    const maxAABB = this.aabbMax,
      minAABB = this.aabbMin,
      nx = this.nx,
      ny = this.ny,
      nz = this.nz;

    const xstep = ny * nz;
    const ystep = nz;
    const zstep = 1;

    const xmax = maxAABB.x,
      ymax = maxAABB.y,
      zmax = maxAABB.z,
      xmin = minAABB.x,
      ymin = minAABB.y,
      zmin = minAABB.z;

    const xmult = nx / (xmax - xmin),
      ymult = ny / (ymax - ymin),
      zmult = nz / (zmax - zmin);

    const binsizeX = (xmax - xmin) / nx,
      binsizeY = (ymax - ymin) / ny,
      binsizeZ = (zmax - zmin) / nz;

    const binRadius =
      Mathf.sqrt(
        binsizeX * binsizeX + binsizeY * binsizeY + binsizeZ * binsizeZ
      ) * 0.5;

    const SPHERE = Shape.SPHERE,
      PLANE = Shape.PLANE;
    // BOX = Shape.BOX,
    // COMPOUND = Shape.COMPOUND,
    // CONVEXPOLYHEDRON = Shape.CONVEXPOLYHEDRON;

    const bins = this.bins,
      binLengths = this.binLengths,
      Nbins = this.bins.length;

    // Reset bins
    for (let i: i32 = 0; i !== Nbins; i++) {
      binLengths[i] = 0;
    }

    // const ceil = Mathf.ceil;
    // const min = Mathf.min;
    // const max = Mathf.max;

    // Put all bodies into the bins
    for (let i: i32 = 0; i != N; i++) {
      const bi = bodies[i];

      for (let s = 0; s < bi.shapes.length; s++) {
        const si = bi.shapes[s];
        switch (si.type) {
          case SPHERE:
            // Put in bin
            // check if overlap with other bins
            const x = bi.position.x,
              y = bi.position.y,
              z = bi.position.z;
            const r = (si as Sphere).radius;

            addBoxToBins(
              x - r,
              y - r,
              z - r,
              x + r,
              y + r,
              z + r,
              bi,
              xstep,
              ystep,
              zstep,
              bins,
              binLengths,
              nx,
              ny,
              nz,
              xmin,
              ymin,
              zmin,
              xmult,
              ymult,
              zmult
            );
            break;

          case PLANE:
            const plane = si as Plane;
            if (plane.worldNormalNeedsUpdate) {
              plane.computeWorldNormal(bi.quaternion);
            }
            const planeNormal = plane.worldNormal;

            //Relative position from origin of plane object to the first bin
            //Incremented as we iterate through the bins
            const xreset = xmin + binsizeX * 0.5 - bi.position.x,
              yreset = ymin + binsizeY * 0.5 - bi.position.y,
              zreset = zmin + binsizeZ * 0.5 - bi.position.z;

            const d = GridBroadphase_collisionPairs_d;
            d.set(xreset, yreset, zreset);

            for (
              let xi: i32 = 0, xoff = 0;
              xi !== nx;
              xi++, xoff += xstep, d.y = yreset, d.x += binsizeX
            ) {
              for (
                let yi: i32 = 0, yoff = 0;
                yi !== ny;
                yi++, yoff += ystep, d.z = zreset, d.y += binsizeY
              ) {
                for (
                  let zi: i32 = 0, zoff = 0;
                  zi !== nz;
                  zi++, zoff += zstep, d.z += binsizeZ
                ) {
                  if (d.dot(planeNormal) < binRadius) {
                    const idx = xoff + yoff + zoff;
                    bins[idx][binLengths[idx]++] = bi;
                  }
                }
              }
            }
            break;

          default:
            if (bi.aabbNeedsUpdate) {
              bi.computeAABB();
            }

            addBoxToBins(
              bi.aabb.lowerBound.x,
              bi.aabb.lowerBound.y,
              bi.aabb.lowerBound.z,
              bi.aabb.upperBound.x,
              bi.aabb.upperBound.y,
              bi.aabb.upperBound.z,
              bi,
              xstep,
              ystep,
              zstep,
              bins,
              binLengths,
              nx,
              ny,
              nz,
              xmin,
              ymin,
              zmin,
              xmult,
              ymult,
              zmult
            );
            break;
        }
      }
    }

    // Check each bin
    for (let i: i32 = 0; i !== Nbins; i++) {
      const binLength = binLengths[i];
      //Skip bins with no potential collisions
      if (binLength > 1) {
        const bin = bins[i];

        // Do N^2 broadphase inside
        for (let xi: i32 = 0; xi !== binLength; xi++) {
          const bi = bin[xi];
          for (let yi: i32 = 0; yi !== xi; yi++) {
            const bj = bin[yi];
            if (this.needBroadphaseCollision(bi, bj)) {
              this.intersectionTest(bi, bj, pairs1, pairs2);
            }
          }
        }
      }
    }

    //	for (const zi = 0, zoff=0; zi < nz; zi++, zoff+= zstep) {
    //		console.log("layer "+zi);
    //		for (const yi = 0, yoff=0; yi < ny; yi++, yoff += ystep) {
    //			const row = '';
    //			for (const xi = 0, xoff=0; xi < nx; xi++, xoff += xstep) {
    //				const idx = xoff + yoff + zoff;
    //				row += ' ' + binLengths[idx];
    //			}
    //			console.log(row);
    //		}
    //	}

    this.makePairsUnique(pairs1, pairs2);
  }
}

function addBoxToBins(
  x0: f32,
  y0: f32,
  z0: f32,
  x1: f32,
  y1: f32,
  z1: f32,
  bi: Body,
  xstep: i32,
  ystep: i32,
  zstep: i32,
  bins: Body[][],
  binLengths: i32[],
  nx: i32,
  ny: i32,
  nz: i32,
  xmin: f32,
  ymin: f32,
  zmin: f32,
  xmult: f32,
  ymult: f32,
  zmult: f32
): void {
  let xoff0: i32 = ((x0 - xmin) * xmult) | 0,
    yoff0: i32 = ((y0 - ymin) * ymult) | 0,
    zoff0: i32 = ((z0 - zmin) * zmult) | 0,
    xoff1: i32 = i32(Mathf.ceil((x1 - xmin) * xmult)),
    yoff1: i32 = i32(Mathf.ceil((y1 - ymin) * ymult)),
    zoff1: i32 = i32(Mathf.ceil((z1 - zmin) * zmult));

  if (xoff0 < 0) {
    xoff0 = 0;
  } else if (xoff0 >= nx) {
    xoff0 = nx - 1;
  }
  if (yoff0 < 0) {
    yoff0 = 0;
  } else if (yoff0 >= ny) {
    yoff0 = ny - 1;
  }
  if (zoff0 < 0) {
    zoff0 = 0;
  } else if (zoff0 >= nz) {
    zoff0 = nz - 1;
  }
  if (xoff1 < 0) {
    xoff1 = 0;
  } else if (xoff1 >= nx) {
    xoff1 = nx - 1;
  }
  if (yoff1 < 0) {
    yoff1 = 0;
  } else if (yoff1 >= ny) {
    yoff1 = ny - 1;
  }
  if (zoff1 < 0) {
    zoff1 = 0;
  } else if (zoff1 >= nz) {
    zoff1 = nz - 1;
  }

  xoff0 *= xstep;
  yoff0 *= ystep;
  zoff0 *= zstep;
  xoff1 *= xstep;
  yoff1 *= ystep;
  zoff1 *= zstep;

  for (let xoff: i32 = xoff0; xoff <= xoff1; xoff += xstep) {
    for (let yoff: i32 = yoff0; yoff <= yoff1; yoff += ystep) {
      for (let zoff: i32 = zoff0; zoff <= zoff1; zoff += zstep) {
        const idx = xoff + yoff + zoff;
        bins[idx][binLengths[idx]++] = bi;
      }
    }
  }
}
