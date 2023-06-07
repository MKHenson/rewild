import { INoise } from "./Noise";

export class NoisePerlin implements INoise {
  seed: i32;
  p: i32[];
  perm: i32[];

  /**
   * Initialize Perlin noise generator with the given seed.
   * Precompute permutation table.
   */
  constructor(seed: i32 = 0) {
    this.seed = seed;
    this.p = new Array(512);
    this.perm = this.generatePerm();

    for (let i: i32 = 0; i < 512; i++) {
      this.p[i] = this.perm[i & 255];
    }
  }

  generatePerm(): i32[] {
    let perm = new Array<i32>(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }

    // Implement the Fisher-Yates shuffle algorithm to shuffle the perm array
    for (let i = 255; i > 0; i--) {
      let j = this.randomInt(i + 1);
      let temp = perm[i];
      perm[i] = perm[j];
      perm[j] = temp;
    }

    return perm;
  }

  private randomInt(max: i32): i32 {
    // Implement a simple linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return i32((f32(this.seed) / f32(2 ** 32)) * f32(max));
  }

  /**
   * Linear interpolation between a and b by t.
   * The parameter t should be in range of 0.0 - 1.0
   */
  lerp(a: f32, b: f32, t: f32): f32 {
    return (1 - t) * a + t * b;
  }

  /**
   * Helper function to hash an integer to a gradient direction.
   * Hashes the input value and calculates gradient based on it.
   */
  grad(hash: i32, x: f32, y: f32): f32 {
    const h = hash & 15;
    const u = h < 8 ? x : y,
      v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Compute Perlin noise at coordinates x, y
   */
  get2D(xin: f32, yin: f32): f32 {
    const X = i32(Mathf.floor(xin)) & 255,
      Y = i32(Mathf.floor(yin)) & 255;
    const x = xin - Mathf.floor(xin),
      y = yin - Mathf.floor(yin);
    const u = this.fade(x),
      v = this.fade(y);
    const A = this.p[X] + Y,
      AA = this.p[A],
      AB = this.p[A + 1],
      B = this.p[X + 1] + Y,
      BA = this.p[B],
      BB = this.p[B + 1];

    return (
      (1.5 *
        this.lerp(
          this.lerp(
            this.grad(this.p[AA], x, y),
            this.grad(this.p[BA], x - 1, y),
            u
          ),
          this.lerp(
            this.grad(this.p[AB], x, y - 1),
            this.grad(this.p[BB], x - 1, y - 1),
            u
          ),
          v
        ) +
        1) /
      2
    );
  }

  /**
   * Fade function as defined by Ken Perlin.
   * This eases coordinate values so that they will "ease" towards integral values.
   * This ends up smoothing the final output.
   */
  fade(t: f32): f32 {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // constructor(seed = 0) {
  //   this.seed = seed;
  //   this.p = new Array(512);
  //   this.perm = [
  //     151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  //     140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247,
  //     120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177,
  //     33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
  //     71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211,
  //     133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25,
  //     63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
  //     135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  //     226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206,
  //     59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248,
  //     152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22,
  //     39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218,
  //     246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  //     81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  //     184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  //     222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  //     151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  //     140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247,
  //     120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177,
  //     33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
  //     71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211,
  //     133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25,
  //     63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
  //     135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  //     226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206,
  //     59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248,
  //     152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22,
  //     39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218,
  //     246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  //     81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  //     184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  //     222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  //   ];

  //   for (let i = 0; i < 512; i++) {
  //     this.p[i] = this.perm[i & 255];
  //   }
  // }

  // lerp(a, b, t) {
  //   return (1 - t) * a + t * b;
  // }

  // grad(hash, x, y) {
  //   const h = hash & 15;
  //   const u = h < 8 ? x : y,
  //     v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
  //   return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  // }

  // noise(xin, yin) {
  //   const X = Math.floor(xin) & 255,
  //     Y = Math.floor(yin) & 255;
  //   const x = xin - Math.floor(xin),
  //     y = yin - Math.floor(yin);
  //   const u = this.fade(x),
  //     v = this.fade(y);
  //   const A = this.p[X] + Y,
  //     AA = this.p[A],
  //     AB = this.p[A + 1],
  //     B = this.p[X + 1] + Y,
  //     BA = this.p[B],
  //     BB = this.p[B + 1];

  //   return this.lerp(
  //     this.lerp(
  //       this.grad(this.p[AA], x, y),
  //       this.grad(this.p[BA], x - 1, y),
  //       u
  //     ),
  //     this.lerp(
  //       this.grad(this.p[AB], x, y - 1),
  //       this.grad(this.p[BB], x - 1, y - 1),
  //       u
  //     ),
  //     v
  //   );
  // }

  // fade(t) {
  //   return t * t * t * (t * (t * 6 - 15) + 10);
  // }
}
