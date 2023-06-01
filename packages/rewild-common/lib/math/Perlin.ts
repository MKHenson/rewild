// class Grad {
//   constructor(public x: f32, public y: f32, public z: f32) {}

//   dot2(x: f32, y: f32): f32 {
//     return this.x * x + this.y * y;
//   }

//   dot3(x: f32, y: f32, z: f32): f32 {
//     return this.x * x + this.y * y + this.z * z;
//   }
// }

// const grad3 = [
//   new Grad(1, 1, 0),
//   new Grad(-1, 1, 0),
//   new Grad(1, -1, 0),
//   new Grad(-1, -1, 0),
//   new Grad(1, 0, 1),
//   new Grad(-1, 0, 1),
//   new Grad(1, 0, -1),
//   new Grad(-1, 0, -1),
//   new Grad(0, 1, 1),
//   new Grad(0, -1, 1),
//   new Grad(0, 1, -1),
//   new Grad(0, -1, -1),
// ];

// const p: i32[] = [
//   151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21,
//   10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149,
//   56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229,
//   122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209,
//   76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
//   226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42,
//   223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
//   108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179,
//   162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50,
//   45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
// ];

// // To remove the need for index wrapping, double the permutation table length
// const perm = new Array<i32>(512);
// const gradP = new Array<Grad>(512);

// // This isn't a very good seeding function, but it works ok. It supports 2^16
// // different seed values. Write something better if you need more seeds.
// export function seed(seed: i32): void {
//   if (seed > 0 && seed < 1) {
//     // Scale the seed out
//     seed *= 65536;
//   }

//   seed = i32(Mathf.floor(f32(seed)));
//   if (seed < 256) {
//     seed |= seed << 8;
//   }

//   for (let i: i32 = 0; i < 256; i++) {
//     let v: i32;
//     if (i & 1) {
//       v = p[i] ^ (seed & 255);
//     } else {
//       v = p[i] ^ ((seed >> 8) & 255);
//     }

//     perm[i] = perm[i + 256] = v;
//     gradP[i] = gradP[i + 256] = grad3[v % 12];
//   }
// }

// seed(i32(Mathf.random()) * i32.MAX_VALUE);

// /*
//   for(const i=0; i<256; i++) {
//     perm[i] = perm[i + 256] = p[i];
//     gradP[i] = gradP[i + 256] = grad3[perm[i] % 12];
//   }*/

// // Skewing and unskewing factors for 2, 3, and 4 dimensions
// const F2: f32 = 0.5 * (Mathf.sqrt(3) - 1);
// const G2: f32 = (3 - Mathf.sqrt(3)) / 6;

// const F3: f32 = 1 / 3;
// const G3: f32 = 1 / 6;

// // 2D simplex noise
// export function simplex2(xin: f32, yin: f32): f32 {
//   let n0: f32, n1: f32, n2: f32; // Noise contributions from the three corners
//   // Skew the input space to determine which simplex cell we're in
//   const s = (xin + yin) * F2; // Hairy factor for 2D
//   let i: f32 = Mathf.floor(xin + s);
//   let j: f32 = Mathf.floor(yin + s);
//   const t = (i + j) * G2;
//   const x0 = xin - i + t; // The x,y distances from the cell origin, unskewed.
//   const y0 = yin - j + t;
//   // For the 2D case, the simplex shape is an equilateral triangle.
//   // Determine which simplex we are in.
//   let i1: f32, j1: f32; // Offsets for second (middle) corner of simplex in (i,j) coords
//   if (x0 > y0) {
//     // lower triangle, XY order: (0,0)->(1,0)->(1,1)
//     i1 = 1;
//     j1 = 0;
//   } else {
//     // upper triangle, YX order: (0,0)->(0,1)->(1,1)
//     i1 = 0;
//     j1 = 1;
//   }
//   // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
//   // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
//   // c = (3-sqrt(3))/6
//   const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
//   const y1 = y0 - j1 + G2;
//   const x2 = x0 - 1 + 2 * G2; // Offsets for last corner in (x,y) unskewed coords
//   const y2 = y0 - 1 + 2 * G2;
//   // Work out the hashed gradient indices of the three simplex corners
//   i &= 255;
//   j &= 255;
//   const gi0 = gradP[i + perm[j]];
//   const gi1 = gradP[i + i1 + perm[j + j1]];
//   const gi2 = gradP[i + 1 + perm[j + 1]];
//   // Calculate the contribution from the three corners
//   let t0: f32 = 0.5 - x0 * x0 - y0 * y0;
//   if (t0 < 0) {
//     n0 = 0;
//   } else {
//     t0 *= t0;
//     n0 = t0 * t0 * gi0.dot2(x0, y0); // (x,y) of grad3 used for 2D gradient
//   }
//   let t1: f32 = 0.5 - x1 * x1 - y1 * y1;
//   if (t1 < 0) {
//     n1 = 0;
//   } else {
//     t1 *= t1;
//     n1 = t1 * t1 * gi1.dot2(x1, y1);
//   }
//   let t2: f32 = 0.5 - x2 * x2 - y2 * y2;
//   if (t2 < 0) {
//     n2 = 0;
//   } else {
//     t2 *= t2;
//     n2 = t2 * t2 * gi2.dot2(x2, y2);
//   }
//   // Add contributions from each corner to get the final noise value.
//   // The result is scaled to return values in the interval [-1,1].
//   return 70 * (n0 + n1 + n2);
// }

// // 3D simplex noise
// export function simplex3(xin: f32, yin: f32, zin: f32): f32 {
//   let n0: f32, n1: f32, n2: f32, n3: f32; // Noise contributions from the four corners

//   // Skew the input space to determine which simplex cell we're in
//   const s: f32 = (xin + yin + zin) * F3; // Hairy factor for 2D
//   let i: f32 = Mathf.floor(xin + s);
//   let j: f32 = Mathf.floor(yin + s);
//   let k: f32 = Mathf.floor(zin + s);

//   const t = (i + j + k) * G3;
//   const x0 = xin - i + t; // The x,y distances from the cell origin, unskewed.
//   const y0 = yin - j + t;
//   const z0 = zin - k + t;

//   // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
//   // Determine which simplex we are in.
//   let i1: f32, j1: f32, k1: f32; // Offsets for second corner of simplex in (i,j,k) coords
//   let i2: f32, j2: f32, k2: f32; // Offsets for third corner of simplex in (i,j,k) coords
//   if (x0 >= y0) {
//     if (y0 >= z0) {
//       i1 = 1;
//       j1 = 0;
//       k1 = 0;
//       i2 = 1;
//       j2 = 1;
//       k2 = 0;
//     } else if (x0 >= z0) {
//       i1 = 1;
//       j1 = 0;
//       k1 = 0;
//       i2 = 1;
//       j2 = 0;
//       k2 = 1;
//     } else {
//       i1 = 0;
//       j1 = 0;
//       k1 = 1;
//       i2 = 1;
//       j2 = 0;
//       k2 = 1;
//     }
//   } else {
//     if (y0 < z0) {
//       i1 = 0;
//       j1 = 0;
//       k1 = 1;
//       i2 = 0;
//       j2 = 1;
//       k2 = 1;
//     } else if (x0 < z0) {
//       i1 = 0;
//       j1 = 1;
//       k1 = 0;
//       i2 = 0;
//       j2 = 1;
//       k2 = 1;
//     } else {
//       i1 = 0;
//       j1 = 1;
//       k1 = 0;
//       i2 = 1;
//       j2 = 1;
//       k2 = 0;
//     }
//   }
//   // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
//   // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
//   // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
//   // c = 1/6.
//   const x1 = x0 - i1 + G3; // Offsets for second corner
//   const y1 = y0 - j1 + G3;
//   const z1 = z0 - k1 + G3;

//   const x2 = x0 - i2 + 2 * G3; // Offsets for third corner
//   const y2 = y0 - j2 + 2 * G3;
//   const z2 = z0 - k2 + 2 * G3;

//   const x3 = x0 - 1 + 3 * G3; // Offsets for fourth corner
//   const y3 = y0 - 1 + 3 * G3;
//   const z3 = z0 - 1 + 3 * G3;

//   // Work out the hashed gradient indices of the four simplex corners
//   i &= 255;
//   j &= 255;
//   k &= 255;
//   const gi0 = gradP[i + perm[j + perm[k]]];
//   const gi1 = gradP[i + i1 + perm[j + j1 + perm[k + k1]]];
//   const gi2 = gradP[i + i2 + perm[j + j2 + perm[k + k2]]];
//   const gi3 = gradP[i + 1 + perm[j + 1 + perm[k + 1]]];

//   // Calculate the contribution from the four corners
//   let t0: f32 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
//   if (t0 < 0) {
//     n0 = 0;
//   } else {
//     t0 *= t0;
//     n0 = t0 * t0 * gi0.dot3(x0, y0, z0); // (x,y) of grad3 used for 2D gradient
//   }
//   let t1: f32 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
//   if (t1 < 0) {
//     n1 = 0;
//   } else {
//     t1 *= t1;
//     n1 = t1 * t1 * gi1.dot3(x1, y1, z1);
//   }
//   let t2: f32 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
//   if (t2 < 0) {
//     n2 = 0;
//   } else {
//     t2 *= t2;
//     n2 = t2 * t2 * gi2.dot3(x2, y2, z2);
//   }
//   let t3: f32 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
//   if (t3 < 0) {
//     n3 = 0;
//   } else {
//     t3 *= t3;
//     n3 = t3 * t3 * gi3.dot3(x3, y3, z3);
//   }
//   // Add contributions from each corner to get the final noise value.
//   // The result is scaled to return values in the interval [-1,1].
//   return 32 * (n0 + n1 + n2 + n3);
// }

// // ##### Perlin noise stuff

// function fade(t: f32): f32 {
//   return t * t * t * (t * (t * 6 - 15) + 10);
// }

// function lerp(a: f32, b: f32, t: f32): f32 {
//   return (1 - t) * a + t * b;
// }

// // 2D Perlin Noise
// export function perlin2(x: f32, y: f32): f32 {
//   // Find unit grid cell containing point
//   let X = Mathf.floor(x),
//     Y = Mathf.floor(y);
//   // Get relative xy coordinates of point within that cell
//   x = x - X;
//   y = y - Y;
//   // Wrap the integer cells at 255 (smaller integer period can be introduced here)
//   X = X & 255;
//   Y = Y & 255;

//   // Calculate noise contributions from each of the four corners
//   const n00 = gradP[X + perm[Y]].dot2(x, y);
//   const n01 = gradP[X + perm[Y + 1]].dot2(x, y - 1);
//   const n10 = gradP[X + 1 + perm[Y]].dot2(x - 1, y);
//   const n11 = gradP[X + 1 + perm[Y + 1]].dot2(x - 1, y - 1);

//   // Compute the fade curve value for x
//   const u = fade(x);

//   // Interpolate the four results
//   return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(y));
// }

// // 3D Perlin Noise
// export function perlin3(x: f32, y: f32, z: f32): f32 {
//   // Find unit grid cell containing point
//   let X = Mathf.floor(x),
//     Y = Mathf.floor(y),
//     Z = Mathf.floor(z);
//   // Get relative xyz coordinates of point within that cell
//   x = x - X;
//   y = y - Y;
//   z = z - Z;
//   // Wrap the integer cells at 255 (smaller integer period can be introduced here)
//   X = X & 255;
//   Y = Y & 255;
//   Z = Z & 255;

//   // Calculate noise contributions from each of the eight corners
//   const n000 = gradP[X + perm[Y + perm[Z]]].dot3(x, y, z);
//   const n001 = gradP[X + perm[Y + perm[Z + 1]]].dot3(x, y, z - 1);
//   const n010 = gradP[X + perm[Y + 1 + perm[Z]]].dot3(x, y - 1, z);
//   const n011 = gradP[X + perm[Y + 1 + perm[Z + 1]]].dot3(x, y - 1, z - 1);
//   const n100 = gradP[X + 1 + perm[Y + perm[Z]]].dot3(x - 1, y, z);
//   const n101 = gradP[X + 1 + perm[Y + perm[Z + 1]]].dot3(x - 1, y, z - 1);
//   const n110 = gradP[X + 1 + perm[Y + 1 + perm[Z]]].dot3(x - 1, y - 1, z);
//   const n111 = gradP[X + 1 + perm[Y + 1 + perm[Z + 1]]].dot3(x - 1, y - 1, z - 1);

//   // Compute the fade curve value for x, y, z
//   const u = fade(x);
//   const v = fade(y);
//   const w = fade(z);

//   // Interpolate
//   return lerp(lerp(lerp(n000, n100, u), lerp(n001, n101, u), w), lerp(lerp(n010, n110, u), lerp(n011, n111, u), w), v);
// }

// // const B: i32 = 0x100;
// // const BM: i32 = 0xff;
// // const N: i32 = 0x1000;

// // function s_curve(t: f32): f32 {
// //   return t * t * (3.0 - 2.0 * t);
// // }

// // function lerp(t: f32, a: f32, b: f32): f32 {
// //   return a + t * (b - a);
// // }

// // class Vec3 {
// //   constructor(public x: f32, public y: f32, public z: f32) {}
// // }
// // const v2 = new Vec3(0, 0, 0);

// // function normalize2(x: f32, y: f32): Vec3 {
// //   let s: f32;

// //   s = Mathf.sqrt(x * x + y * y);
// //   x = x / s;
// //   y = y / s;

// //   v2.x = x;
// //   v2.y = y;
// //   return v2;
// // }

// // function normalize3(x: f32, y: f32, z: f32): Vec3 {
// //   let s: f32;
// //   s = Mathf.sqrt(x * x + y * y + z * z);
// //   x = x / s;
// //   y = y / s;
// //   z = z / s;

// //   v2.x = x;
// //   v2.y = y;
// //   v2.z = z;
// //   return v2;
// // }

// // function at2(rx: f32, ry: f32, x: f32, y: f32): f32 {
// //   return rx * x + ry * y;
// // }
// // function at3(rx: f32, ry: f32, rz: f32, x: f32, y: f32, z: f32): f32 {
// //   return rx * x + ry * y + rz * z;
// // }

// // class Random {
// //   seed: string;
// //   private hash: i32;

// //   constructor(seed: string) {
// //     this.seed = seed;
// //     this.hash = 0;

// //     let hash: i32 = 1779033703 ^ seed.length;
// //     for (let i: i32 = 0; i < seed.length; i++) {
// //       let bitwise_xor_from_character = hash ^ seed.charCodeAt(i);
// //       hash = Mathf.imul(bitwise_xor_from_character, 3432918353);
// //       hash = (hash << 13) | (hash >>> 19);
// //     }

// //     this.hash = hash;
// //   }

// //   // Define the Murmur3Hash function
// //   private generate_seed() {
// //     // Return the hash that you can use as a seed
// //     this.hash = Mathf.imul(this.hash ^ (this.hash >>> 16), 2246822507);
// //     this.hash = Mathf.imul(this.hash ^ (this.hash >>> 13), 3266489909);
// //     return (this.hash ^= this.hash >>> 16) >>> 0;
// //   }

// //   next() {
// //     let a = this.generate_seed(),
// //       b = this.generate_seed(),
// //       c = this.generate_seed(),
// //       d = this.generate_seed();
// //     a >>>= 0;
// //     b >>>= 0;
// //     c >>>= 0;
// //     d >>>= 0;
// //     let t = (a + b) | 0;
// //     a = b ^ (b >>> 9);
// //     b = (c + (c << 3)) | 0;
// //     c = (c << 21) | (c >>> 11);
// //     d = (d + 1) | 0;
// //     t = (t + d) | 0;
// //     c = (c + t) | 0;
// //     return (t >>> 0) / 4294967296;
// //   }

// //   nextInt(max: i32): i32 {
// //     return (this.next() * max) | 0;
// //   }
// // }

// // const setupBuffer: f32[] = [];

// // export class Perlin {
// //   // Original C code derived from
// //   // http://astronomy.swin.edu.au/~pbourke/texture/perlin/perlin.c
// //   // http://astronomy.swin.edu.au/~pbourke/texture/perlin/perlin.h

// //   p: i32[];
// //   g3: f32[][];
// //   g2: f32[][];
// //   g1: f32[];

// //   constructor() {
// //     this.p = new Array(B + B + 2);
// //     this.g3 = new Array(B + B + 2);
// //     for (let i = 0, l = this.g3.length; i < l; i++) this.g3[i] = new Array(3);

// //     this.g2 = new Array(B + B + 2);
// //     for (let i = 0, l = this.g2.length; i < l; i++) this.g2[i] = new Array(2);

// //     this.g1 = new Array(B + B + 2);
// //     this.setSeed("happy");
// //   }

// //   private setup(value: f32, b0: i32, b1: i32, r0: f32, r1: f32): void {
// //     let t: f32 = value + N;
// //     b0 = (t | 0) & BM;
// //     b1 = (b0 + 1) & BM;
// //     r0 = t - (t | 0);
// //     r1 = r0 - 1.0;

// //     setupBuffer[0] = b0;
// //     setupBuffer[1] = b1;
// //     setupBuffer[2] = r0;
// //     setupBuffer[3] = r1;
// //   }

// //   noise1(arg: f32): f32 {
// //     const g1 = this.g1;
// //     const p = this.p;
// //     let bx0: i32 = 0,
// //       bx1: i32 = 0;
// //     let rx0: f32 = 0,
// //       rx1: f32 = 0,
// //       sx: f32,
// //       u: f32,
// //       v: f32;
// //     this.setup(arg, bx0, bx1, rx0, rx1);

// //     bx0 = setupBuffer[0];
// //     bx1 = setupBuffer[1];
// //     rx0 = setupBuffer[2];
// //     rx1 = setupBuffer[3];

// //     sx = s_curve(rx0);
// //     u = rx0 * g1[p[bx0]];
// //     v = rx1 * g1[p[bx1]];

// //     return lerp(sx, u, v);
// //   }

// //   noise2(x: f32, y: f32): f32 {
// //     const p = this.p;
// //     const g2 = this.g2;

// //     let bx0: i32 = 0,
// //       bx1: i32 = 0,
// //       by0: i32 = 0,
// //       by1: i32 = 0,
// //       b00: i32,
// //       b10: i32,
// //       b01: i32,
// //       b11: i32;
// //     let rx0: f32 = 0,
// //       rx1: f32 = 0,
// //       ry0: f32 = 0,
// //       ry1: f32 = 0,
// //       sx: f32,
// //       sy: f32,
// //       a: f32,
// //       b: f32,
// //       u: f32,
// //       v: f32;
// //     let i: i32, j: i32;

// //     this.setup(x, bx0, bx1, rx0, rx1);

// //     bx0 = setupBuffer[0];
// //     bx1 = setupBuffer[1];
// //     rx0 = setupBuffer[2];
// //     rx1 = setupBuffer[3];

// //     this.setup(y, by0, by1, ry0, ry1);
// //     by0 = setupBuffer[0];
// //     by1 = setupBuffer[1];
// //     ry0 = setupBuffer[2];
// //     ry1 = setupBuffer[3];

// //     i = p[bx0];
// //     j = p[bx1];

// //     b00 = p[i + by0];
// //     b10 = p[j + by0];
// //     b01 = p[i + by1];
// //     b11 = p[j + by1];

// //     sx = s_curve(rx0);
// //     sy = s_curve(ry0);

// //     u = at2(rx0, ry0, g2[b00][0], g2[b00][1]);
// //     v = at2(rx1, ry0, g2[b10][0], g2[b10][1]);
// //     a = lerp(sx, u, v);

// //     u = at2(rx0, ry1, g2[b01][0], g2[b01][1]);
// //     v = at2(rx1, ry1, g2[b11][0], g2[b11][1]);
// //     b = lerp(sx, u, v);

// //     return lerp(sy, a, b);
// //   }

// //   noise3(x: f32, y: f32, z: f32): f32 {
// //     const p = this.p;
// //     const g3 = this.g3;

// //     let bx0: i32 = 0,
// //       bx1: i32 = 0,
// //       by0: i32 = 0,
// //       by1: i32 = 0,
// //       bz0: i32 = 0,
// //       bz1: i32 = 0,
// //       b00: i32,
// //       b10: i32,
// //       b01: i32,
// //       b11: i32;
// //     let rx0: f32 = 0,
// //       rx1: f32 = 0,
// //       ry0: f32 = 0,
// //       ry1: f32 = 0,
// //       rz0: f32 = 0,
// //       rz1: f32 = 0,
// //       sy: f32,
// //       sz: f32,
// //       a: f32,
// //       b: f32,
// //       c: f32,
// //       d: f32,
// //       t: f32,
// //       u: f32,
// //       v: f32;
// //     let i: i32, j: i32;

// //     this.setup(x, bx0, bx1, rx0, rx1);
// //     bx0 = setupBuffer[0];
// //     bx1 = setupBuffer[1];
// //     rx0 = setupBuffer[2];
// //     rx1 = setupBuffer[3];

// //     this.setup(y, by0, by1, ry0, ry1);
// //     by0 = setupBuffer[0];
// //     by1 = setupBuffer[1];
// //     ry0 = setupBuffer[2];
// //     ry1 = setupBuffer[3];

// //     this.setup(z, bz0, bz1, rz0, rz1);
// //     bz0 = setupBuffer[0];
// //     bz1 = setupBuffer[1];
// //     rz0 = setupBuffer[2];
// //     rz1 = setupBuffer[3];

// //     i = p[bx0];
// //     j = p[bx1];

// //     b00 = p[i + by0];
// //     b10 = p[j + by0];
// //     b01 = p[i + by1];
// //     b11 = p[j + by1];

// //     t = s_curve(rx0);
// //     sy = s_curve(ry0);
// //     sz = s_curve(rz0);

// //     u = at3(rx0, ry0, rz0, g3[b00 + bz0][0], g3[b00 + bz0][1], g3[b00 + bz0][2]);
// //     v = at3(rx1, ry0, rz0, g3[b10 + bz0][0], g3[b10 + bz0][1], g3[b10 + bz0][2]);
// //     a = lerp(t, u, v);

// //     u = at3(rx0, ry1, rz0, g3[b01 + bz0][0], g3[b01 + bz0][1], g3[b01 + bz0][2]);
// //     v = at3(rx1, ry1, rz0, g3[b11 + bz0][0], g3[b11 + bz0][1], g3[b11 + bz0][2]);
// //     b = lerp(t, u, v);

// //     c = lerp(sy, a, b);

// //     u = at3(rx0, ry0, rz1, g3[b00 + bz1][0], g3[b00 + bz1][2], g3[b00 + bz1][2]);
// //     v = at3(rx1, ry0, rz1, g3[b10 + bz1][0], g3[b10 + bz1][1], g3[b10 + bz1][2]);
// //     a = lerp(t, u, v);

// //     u = at3(rx0, ry1, rz1, g3[b01 + bz1][0], g3[b01 + bz1][1], g3[b01 + bz1][2]);
// //     v = at3(rx1, ry1, rz1, g3[b11 + bz1][0], g3[b11 + bz1][1], g3[b11 + bz1][2]);
// //     b = lerp(t, u, v);

// //     d = lerp(sy, a, b);

// //     return lerp(sz, c, d);
// //   }

// //   setSeed(seed: string): void {
// //     const p = this.p;
// //     const g1 = this.g1;
// //     const g2 = this.g2;
// //     const g3 = this.g3;

// //     let i: i32, j: i32, k: i32;

// //     let rnd: Random = new Random(seed);

// //     for (i = 0; i < B; i++) {
// //       p[i] = i;
// //       g1[i] = f32(rnd.nextInt(B + B) - B) / B;

// //       for (j = 0; j < 2; j++) g2[i][j] = f32(rnd.nextInt(B + B) - B) / B;

// //       normalize2(g2[i][0], g2[i][1]);
// //       g2[i][0] = v2.x;
// //       g2[i][1] = v2.y;

// //       for (j = 0; j < 3; j++) g3[i][j] = f32(rnd.nextInt(B + B) - B) / B;

// //       normalize3(g3[i][0], g3[i][1], g3[i][2]);
// //       g3[i][0] = v2.x;
// //       g3[i][1] = v2.y;
// //       g3[i][2] = v2.z;
// //     }

// //     while (--i != 0) {
// //       k = p[i];
// //       p[i] = p[(j = rnd.nextInt(B))];
// //       p[j] = k;
// //     }

// //     for (i = 0; i < B + 2; i++) {
// //       p[B + i] = p[i];
// //       g1[B + i] = g1[i];
// //       for (j = 0; j < 2; j++) g2[B + i][j] = g2[i][j];
// //       for (j = 0; j < 3; j++) g3[B + i][j] = g3[i][j];
// //     }
// //   }
// // }

// V2

// Constants
const perm: i32[] = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
  36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
  75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
  149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
  27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
  92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
  209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
  164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
  147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
  28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
  155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
  191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31,
  181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
  61, 156, 180,
];

// Function to calculate Perlin noise at given coordinates (x, y)
export function perlinNoise2D(x: f32, y: f32): f32 {
  // Calculate the integer grid coordinates
  const xi0: i32 = Mathf.floor(x) & 255;
  const yi0: i32 = Mathf.floor(y) & 255;
  const xi1: i32 = (xi0 + 1) & 255;
  const yi1: i32 = (yi0 + 1) & 255;

  // Calculate the fractional coordinates within the unit square
  const xf: f32 = x - Mathf.floor(x);
  const yf: f32 = y - Mathf.floor(y);

  // Smooth the fractional coordinates
  const u: f32 = fade(xf);
  const v: f32 = fade(yf);

  // Perlin gradients
  const g00: f32 = grad(perm[xi0 + perm[yi0]], xf, yf);
  const g01: f32 = grad(perm[xi0 + perm[yi1]], xf, yf - 1);
  const g10: f32 = grad(perm[xi1 + perm[yi0]], xf - 1, yf);
  const g11: f32 = grad(perm[xi1 + perm[yi1]], xf - 1, yf - 1);

  // Interpolate the gradients
  const n0: f32 = lerp(g00, g10, u);
  const n1: f32 = lerp(g01, g11, u);
  const n2: f32 = lerp(n0, n1, v);

  return n2;
}

// Function to calculate Perlin noise at given coordinates (x, y) with a seed
export function perlinNoise2DWithSeed(x: f32, y: f32, seed: i32): f32 {
  // Calculate the integer grid coordinates
  const xi0: i32 = Mathf.floor(x) & 255;
  const yi0: i32 = Mathf.floor(y) & 255;
  const xi1: i32 = (xi0 + 1) & 255;
  const yi1: i32 = (yi0 + 1) & 255;

  // Calculate the fractional coordinates within the unit square
  const xf: f32 = x - Mathf.floor(x);
  const yf: f32 = y - Mathf.floor(y);

  // Smooth the fractional coordinates
  const u: f32 = fade(xf);
  const v: f32 = fade(yf);

  // Perlin gradients
  const g00: f32 = gradWithSeed(seed, xi0 + perm[yi0], xf, yf);
  const g01: f32 = gradWithSeed(seed, xi0 + perm[yi1], xf, yf - 1);
  const g10: f32 = gradWithSeed(seed, xi1 + perm[yi0], xf - 1, yf);
  const g11: f32 = gradWithSeed(seed, xi1 + perm[yi1], xf - 1, yf - 1);

  // Interpolate the gradients
  const n0: f32 = lerp(g00, g10, u);
  const n1: f32 = lerp(g01, g11, u);
  const n2: f32 = lerp(n0, n1, v);

  return n2;
}

// Fade function for smoothing
function fade(t: f32): f32 {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Linear interpolation function
function lerp(a: f32, b: f32, t: f32): f32 {
  return a + t * (b - a);
}

// Gradient function to calculate dot product of gradient and distance vectors
function grad(hash: i32, x: f32, y: f32): f32 {
  const h: i32 = hash & 15;
  const u: f32 = h < 8 ? x : y;
  const v: f32 = h < 4 ? y : x;
  const r: f32 = (h & 1) === 0 ? u : -u;
  const s: f32 = (h & 2) === 0 ? v : -v;
  return r + s;
}

// Gradient function to calculate dot product of gradient and distance vectors
function gradWithSeed(seed: i32, hash: i32, x: f32, y: f32): f32 {
  const h: i32 = (hash ^ seed) & 15;
  const u: f32 = h < 8 ? x : y;
  const v: f32 = h < 4 ? y : x;
  const r: f32 = (h & 1) === 0 ? u : -u;
  const s: f32 = (h & 2) === 0 ? v : -v;
  return r + s;
}
