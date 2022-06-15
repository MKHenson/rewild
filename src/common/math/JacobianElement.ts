import { Vector3 } from "./Vector3";

/**
 * An element containing 6 entries, 3 spatial and 3 rotational degrees of freedom.
 */
export class JacobianElement {
  spatial: Vector3;
  rotational: Vector3;

  constructor() {
    this.spatial = new Vector3();
    this.rotational = new Vector3();
  }

  /**
   * Multiply with other JacobianElement
   */
  multiplyElement(element: JacobianElement) {
    return element.spatial.dot(this.spatial) + element.rotational.dot(this.rotational);
  }

  /**
   * Multiply with two vectors
   */
  multiplyVectors(spatial: Vector3, rotational: Vector3): f32 {
    return spatial.dot(this.spatial) + rotational.dot(this.rotational);
  }
}
