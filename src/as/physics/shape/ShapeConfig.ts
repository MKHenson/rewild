import { Vec3 } from "../math/Vec3";
import { Mat33 } from "../math/Mat33";

/**
 * A shape configuration holds common configuration data for constructing a shape.
 * These configurations can be reused safely.
 *
 * @author saharan
 * @author lo-th
 */
export class ShapeConfig {
  constructor(
    // position of the shape in parent's coordinate system.
    public relativePosition = new Vec3(),
    // rotation matrix of the shape in parent's coordinate system.
    public relativeRotation = new Mat33(),
    // coefficient of friction of the shape.
    public friction: f32 = 0.2, // 0.4
    // coefficient of restitution of the shape.
    public restitution: f32 = 0.2,
    // density of the shape.
    public density: f32 = 1,
    // bits of the collision groups to which the shape belongs.
    public belongsTo: i32 = 1,
    // bits of the collision groups with which the shape collides.
    public collidesWith: i32 = 0xffffffff
  ) {}
}
