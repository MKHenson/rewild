import { create2DArray } from "../Utils";

export class Simplex {
  // Grad table for Simplex noise
  static grad3: f32[][] = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
  ];

  perm: Uint8Array;
  p: Uint8Array;

  constructor(seed: i32) {
    this.perm = new Uint8Array(512);
    this.p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      this.p[i] = i;
    }

    this.seedPermutationTable(seed);
  }

  // Seeded random number generator
  private createRandom(seed: i32) {
    let value = seed % 2147483647;
    return function random() {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  private seedPermutationTable(seed: i32) {
    const random = this.createRandom(seed);
    const p = this.p;
    const perm = this.perm;

    for (let i = 0; i < 256; i++) {
      const j = Mathf.floor(random() * (i + 1));

      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
    }
  }

  // Simplex noise function
  noise2D(xin: f32, yin: f32): f32 {
    const grad3 = Simplex.grad3;
    const perm = this.perm;

    const F2: f32 = 0.5 * (Mathf.sqrt(3.0) - 1.0);
    const G2: f32 = (3.0 - Mathf.sqrt(3.0)) / 6.0;

    const s: f32 = (xin + yin) * F2;
    const i: i32 = Mathf.floor(xin + s);
    const j: i32 = Mathf.floor(yin + s);

    const t: f32 = (i + j) * G2;
    const X0: f32 = i - t;
    const Y0: f32 = j - t;
    const x0: f32 = xin - X0;
    const y0: f32 = yin - Y0;

    let i1: f32, j1: f32;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1: f32 = x0 - i1 + G2;
    const y1: f32 = y0 - j1 + G2;
    const x2: f32 = x0 - 1.0 + 2.0 * G2;
    const y2: f32 = y0 - 1.0 + 2.0 * G2;

    const ii: i32 = i & 255;
    const jj: i32 = j & 255;
    const gi0: i32 = perm[ii + perm[jj]] % 12;
    const gi1: i32 = perm[ii + i1 + perm[jj + j1]] % 12;
    const gi2: i32 = perm[ii + 1 + perm[jj + 1]] % 12;

    let t0: f32 = 0.5 - x0 * x0 - y0 * y0;
    let n0: f32;
    if (t0 < 0) {
      n0 = 0.0;
    } else {
      t0 *= t0;
      n0 = t0 * t0 * this.dot(grad3[gi0], x0, y0);
    }

    let t1: f32 = 0.5 - x1 * x1 - y1 * y1;
    let n1;
    if (t1 < 0) {
      n1 = 0.0;
    } else {
      t1 *= t1;
      n1 = t1 * t1 * this.dot(grad3[gi1], x1, y1);
    }

    let t2: f32 = 0.5 - x2 * x2 - y2 * y2;
    let n2: f32;
    if (t2 < 0) {
      n2 = 0.0;
    } else {
      t2 *= t2;
      n2 = t2 * t2 * this.dot(grad3[gi2], x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  private dot(g: f32[], x: f32, y: f32) {
    return g[0] * x + g[1] * y;
  }

  // Initialize the canvas and render the noise
  createNoiseMap(map: f32[][]) {
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const width = map.length;
    const height = map[0].length;

    canvas.width = width;
    canvas.height = height;

    let noise: i32[] = new Array(width * height);

    for (let y: f32 = 0; y < height; y++) {
      for (let x: f32 = 0; x < width; x++) {
        let value = map[x][y];
        value = Mathf.floor((value + 1) * 128); // Convert noise value to grayscale
        noise[y * width + x] = value;
      }
    }

    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);

    for (let i = 0; i < noise.length; i++) {
      const value = noise[i];
      imageData.data[i * 4] = value; // Red component
      imageData.data[i * 4 + 1] = value; // Green component
      imageData.data[i * 4 + 2] = value; // Blue component
      imageData.data[i * 4 + 3] = 255; // Alpha component
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  public static generateNoiseMap(
    mapWidth: u16,
    mapHeight: u16,
    scale: f32 = 0.01,
    noise: Simplex = new Simplex(Mathf.floor(Math.random() * 100000))
  ): f32[][] {
    const noiseMap: f32[][] = create2DArray(mapWidth, mapHeight);

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapHeight; x++) {
        const sampleX = f32(x) / f32(mapWidth) / scale;
        const sampleY = f32(y) / f32(mapHeight) / scale;

        const value = noise.noise2D(sampleX, sampleY);
        noiseMap[x][y] = value;
      }
    }

    return noiseMap;
  }
}
