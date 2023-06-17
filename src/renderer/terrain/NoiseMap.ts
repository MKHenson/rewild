import { create2DArray, INoise, NoisePerlin, inverseLerp, RandomNumberGenerator } from "rewild-common";

export class NoiseMap {
  mapWidth: u16;
  mapHeight: u16;
  scale: f32 = 0.01;
  noise: INoise;
  octaves: i32;
  persistance: f32;
  lacunarity: f32;
  offset: f32[];
  seed: i32;
  noiseMap: f32[][];

  constructor(
    size: u16 = 256,
    scale: f32 = 0.01,
    octaves: i32 = 4,
    persistance: f32 = 0.5,
    lacunarity: f32 = 2,
    offset: f32[] = [0, 0],
    seed: i32 = 100
  ) {
    this.mapWidth = size;
    this.mapHeight = size;
    this.noise = new NoisePerlin(Math.random());
    this.octaves = octaves;
    this.persistance = persistance;
    this.lacunarity = lacunarity;
    this.offset = offset;
    this.seed = seed;
    this.scale = scale;

    this.noiseMap = create2DArray(size, size);

    if (this.scale <= 0) this.scale = 0.0001;
    if (this.lacunarity < 1) this.lacunarity = 1;
    if (this.octaves < 0) this.octaves = 0;
    if (this.persistance < 0) this.persistance = 0;
    else if (this.persistance > 1) this.persistance = 1;
  }

  public generate(): NoiseMap {
    const mapWidth = this.mapWidth;
    const mapHeight = this.mapHeight;
    const scale = this.scale;
    const noise = this.noise;
    const octaves = this.octaves;
    const persistance = this.persistance;
    const lacunarity = this.lacunarity;
    const offset = this.offset;
    const seed = this.seed;
    const noiseMap = this.noiseMap;

    let maxNoiseHeight: f32 = Number.MIN_VALUE;
    let minNoiseHeight: f32 = Number.MAX_VALUE;
    const random = new RandomNumberGenerator(seed);

    const halfWidth = mapWidth / 2;
    const halfHeight = mapHeight / 2;

    const offsets: Array<f32[]>[] = new Array(octaves);
    for (let i: i32 = 0; i < octaves; i++) {
      offsets[i] = [
        [random.next(-100000, 100000) + offset[0], random.next(-100000, 100000) * 200000 - 100000 + offset[1]],
      ];
    }

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapHeight; x++) {
        let amplitude: f32 = 1;
        let frequency: f32 = 1;
        let noiseHeight: f32 = 0;

        for (let i: i32 = 0; i < octaves; i++) {
          const sampleX = (f32(x - halfWidth) / f32(mapWidth) / scale) * frequency + offsets[i][0][0];
          const sampleY = (f32(y - halfHeight) / f32(mapHeight) / scale) * frequency + offsets[i][0][1];

          let noiseValue = noise.get2D(sampleX, sampleY) * 2 - 1;
          noiseHeight += noiseValue * amplitude;

          amplitude *= persistance;
          frequency *= lacunarity;
        }

        if (noiseHeight > maxNoiseHeight) maxNoiseHeight = noiseHeight;
        else if (noiseHeight < minNoiseHeight) minNoiseHeight = noiseHeight;

        noiseMap[x][y] = noiseHeight;
      }
    }

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapWidth; x++) {
        noiseMap[x][y] = inverseLerp(minNoiseHeight, maxNoiseHeight, noiseMap[x][y]);
      }
    }

    return this;
  }

  public createCanvas() {
    const map = this.noiseMap;
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const width = map.length;
    const height = map[0].length;

    canvas.width = width;
    canvas.height = height;

    let noise: i32[] = new Array(width * height);

    for (let y: f32 = 0; y < height; y++) {
      for (let x: f32 = 0; x < width; x++) {
        let value = map[x][y];
        value = Mathf.floor(value * 255); // Convert noise value to grayscale
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
}
