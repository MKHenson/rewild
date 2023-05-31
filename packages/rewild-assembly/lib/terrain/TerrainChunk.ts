import { CHUNK_SIZE } from "rewild-common";

export class TerrainChunk {
  data: Float32Array;

  constructor() {
    this.data = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let x: i32 = 0; x < CHUNK_SIZE; x++) {
      for (let z: i32 = 0; z < CHUNK_SIZE; z++) {
        this.data[x * z + x] = 0;
      }
    }
  }

  dispose(): void {}
}
