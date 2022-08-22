import { Mat33 } from "../math/Mat33";

/**
 * This class holds mass information of a shape.
 * @author lo-th
 * @author saharan
 */

export class MassInfo {
  constructor(
    // Mass of the shape.
    public mass: f32 = 0,

    // The moment inertia of the shape.
    public inertia = new Mat33()
  ) {}
}
