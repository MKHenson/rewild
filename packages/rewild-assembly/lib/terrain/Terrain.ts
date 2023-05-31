import { TransformNode } from "../core/TransformNode";

export class Terrain extends TransformNode {
  constructor() {
    super();
  }
}

export function createTerrain(name: string | null): TransformNode {
  const toReturn = new Terrain();
  if (name) toReturn.name = name;
  return toReturn;
}
