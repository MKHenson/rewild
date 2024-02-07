import { TransformNode } from '../../core/TransformNode';
import { createChunk } from '../../Imports';

export class Terrain extends TransformNode {
  isChunkLoaded: boolean;

  constructor() {
    super();
    this.isChunkLoaded = false;
  }

  update(): void {
    if (!this.isChunkLoaded) {
      this.isChunkLoaded = true;
      createChunk(this);
    }
  }
}
