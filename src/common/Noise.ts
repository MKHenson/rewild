import { perlin2 } from "./math/Perlin";

export class Noise {
  public static generateNoiseMap(mapWidth: u16, mapHeight: Uint16Array, scale: f32): f32[][] {
    const noiseMap: f32[][] = new Array(mapWidth).map(() => new Array(mapHeight));

    if (scale == 0) {
      scale = 0.0001;
    }

    for (let y: i32 = 0; y < mapHeight; y++) {
      for (let x: i32 = 0; x < mapHeight; x++) {
        const sampleX = f32(x) / scale;
        const sampleY = f32(x) / scale;

        const perlinValue = perlin2(sampleX, sampleY);
        noiseMap[x][y] = perlinValue;
      }
    }

    return noiseMap;
  }
}
