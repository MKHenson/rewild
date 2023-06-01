import { perlinNoise2D } from "./math/Perlin";

// Function to create a 2D array of f32 values initialized with zeros
export function create2DArray(rows: i32, columns: i32): f32[][] {
  const array: f32[][] = new Array<f32[]>(rows);
  for (let i: i32 = 0; i < rows; i++) {
    array[i] = new Array<f32>(columns).fill(0.0);
  }
  return array;
}

export class Noise {
  public static generateNoiseMap(
    mapWidth: u16,
    mapHeight: u16,
    scale: f32 = 0.01,
    seed: u32 = Date.now()
  ): f32[][] {
    const noiseMap: f32[][] = create2DArray(mapWidth, mapHeight);

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapHeight; x++) {
        const sampleX = f32(x) / f32(mapWidth) / scale;
        const sampleY = f32(y) / f32(mapHeight) / scale;

        const perlinValue: f32 = perlinNoise2D(sampleX, sampleY);
        noiseMap[x][y] = perlinValue;
      }
    }

    return noiseMap;
  }
}
