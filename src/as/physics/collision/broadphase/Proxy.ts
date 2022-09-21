import { AABB } from "../../math/AABB";
import { Shape } from "../../shape/Shape";

let count: i32 = 0;
export function ProxyIdCount(): i32 {
  return count++;
}

/**
 * A proxy is used for broad-phase collecting pairs that can be colliding.
 *
 * @author lo-th
 */

export abstract class Proxy {
  shape: Shape;
  aabb: AABB;

  constructor(shape: Shape) {
    //The parent shape.
    this.shape = shape;

    //The axis-aligned bounding box.
    this.aabb = shape.aabb;
  }

  // Update the proxy. Must be inherited by a child.

  abstract update(): void;
}
