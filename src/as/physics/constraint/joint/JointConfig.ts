import { RigidBody } from "../../core/RigidBody";
import { Vec3 } from "../../math/Vec3";

export class JointConfig {
  scale: f32;
  invScale: f32;

  // The first rigid body of the joint.
  body1: RigidBody | null;
  // The second rigid body of the joint.
  body2: RigidBody | null;
  // The anchor point on the first rigid body in local coordinate system.
  localAnchorPoint1: Vec3;
  //  The anchor point on the second rigid body in local coordinate system.
  localAnchorPoint2: Vec3;
  // The axis in the first body's coordinate system.
  // his property is available in some joints.
  localAxis1: Vec3;
  // The axis in the second body's coordinate system.
  // This property is available in some joints.
  localAxis2: Vec3;
  //  Whether allow collision between connected rigid bodies or not.
  allowCollision: boolean;

  constructor() {
    this.scale = 1;
    this.invScale = 1;

    this.body1 = null;
    this.body2 = null;
    this.localAnchorPoint1 = new Vec3();
    this.localAnchorPoint2 = new Vec3();
    this.localAxis1 = new Vec3();
    this.localAxis2 = new Vec3();
    this.allowCollision = false;
  }
}
