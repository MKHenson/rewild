import { TransformNode } from "../core/TransformNode";
import { createChunk } from "../../lib/Imports";

export class Terrain extends TransformNode {
  isChunkLoaded: boolean;

  constructor() {
    super();
    this.isChunkLoaded = false;
  }

  update(): void {
    if (!this.isChunkLoaded) {
      this.isChunkLoaded = true;
      createChunk(changetype<usize>(this));
    }
  }

  onAddedToParent(): void {}
  onRemovedFromParent(): void {}
}
