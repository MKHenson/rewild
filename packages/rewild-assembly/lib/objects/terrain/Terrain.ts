import { TransformNode } from '../../core/TransformNode';
import { createChunk } from '../../Imports';

export class Terrain extends TransformNode {
  isChunkLoaded: boolean;

  constructor() {
    super();
    this.isChunkLoaded = false;
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);

    if (!this.isChunkLoaded) {
      this.isChunkLoaded = true;
      createChunk(this);
    }
  }
}

export function createTerrain(): TransformNode {
  return new Terrain();
}
