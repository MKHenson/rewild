import { JOINT_NULL } from "../../constants";
import { Constraint } from "../Constraint";
import { JointLink } from "./JointLink";
import { Vec3 } from "../../math/Vec3";
import { Shape } from "../../shape/Shape";
import { RigidBody } from "../../core/RigidBody";
import { JointConfig } from "./JointConfig";
import { World } from "../../core/World";

/**
 * Joints are used to constrain the motion between two rigid bodies.
 *
 * @author saharan
 * @author lo-th
 */

export class Joint extends Constraint {
  scale: f32;
  invScale: f32;

  // The type of the joint.
  type = JOINT_NULL;
  //  The previous joint in the world.
  prev: Joint | null;
  // The next joint in the world.
  next: Joint | null;

  // anchor point on the first rigid body in local coordinate system.
  localAnchorPoint1: Vec3;
  // anchor point on the second rigid body in local coordinate system.
  localAnchorPoint2: Vec3;
  // anchor point on the first rigid body in world coordinate system relative to the body's origin.
  relativeAnchorPoint1: Vec3;
  // anchor point on the second rigid body in world coordinate system relative to the body's origin.
  relativeAnchorPoint2: Vec3;
  //  anchor point on the first rigid body in world coordinate system.
  anchorPoint1: Vec3;
  // anchor point on the second rigid body in world coordinate system.
  anchorPoint2: Vec3;
  // Whether allow collision between connected rigid bodies or not.
  allowCollision: boolean;

  b1Link: JointLink;
  b2Link: JointLink;

  constructor(config: JointConfig) {
    super();

    this.scale = 1;
    this.invScale = 1;

    this.name = "";
    this.id = NaN;

    this.type = JOINT_NULL;
    this.prev = null;
    this.next = null;

    this.body1 = config.body1;
    this.body2 = config.body2;

    this.localAnchorPoint1 = new Vec3().copy(config.localAnchorPoint1);
    this.localAnchorPoint2 = new Vec3().copy(config.localAnchorPoint2);
    this.relativeAnchorPoint1 = new Vec3();
    this.relativeAnchorPoint2 = new Vec3();
    this.anchorPoint1 = new Vec3();
    this.anchorPoint2 = new Vec3();
    this.allowCollision = config.allowCollision;

    this.b1Link = new JointLink(this);
    this.b2Link = new JointLink(this);
  }

  setId(n: i32): void {
    this.id = n;
  }

  setParent(world: World): void {
    this.parent = world;
    this.scale = this.parent.scale;
    this.invScale = this.parent.invScale;
    this.id = this.parent.numJoints;
    if (!this.name) this.name = "J" + this.id;
  }

  // Update all the anchor points.

  updateAnchorPoints(): void {
    this.relativeAnchorPoint1.copy(this.localAnchorPoint1).applyMatrix3(this.body1!.rotation, true);
    this.relativeAnchorPoint2.copy(this.localAnchorPoint2).applyMatrix3(this.body2!.rotation, true);

    this.anchorPoint1.add(this.relativeAnchorPoint1, this.body1!.position);
    this.anchorPoint2.add(this.relativeAnchorPoint2, this.body2!.position);
  }

  // Attach the joint from the bodies.

  attach(): void {
    // isX: boolean = false): void {
    this.b1Link.body = this.body2;
    this.b2Link.body = this.body1;

    // if (isX) {
    //   this.body1!.jointLink!.push(this.b1Link);
    //   this.body2!.jointLink!.push(this.b2Link);
    // }
    // else {
    if (this.body1!.jointLink != null) {
      (this.b1Link.next = this.body1!.jointLink).prev = this.b1Link;
    } else {
      this.b1Link.next = null;
    }
    this.body1!.jointLink = this.b1Link;
    this.body1!.numJoints++;
    if (this.body2!.jointLink != null) (this.b2Link.next = this.body2!.jointLink).prev = this.b2Link;
    else this.b2Link.next = null;
    this.body2!.jointLink = this.b2Link;
    this.body2!.numJoints++;
    //  }
  }

  // Detach the joint from the bodies.

  detach(): void {
    // isX: boolean = false): void {
    // if (isX) {
    //   this.body1!.jointLink!.splice(this.body1!.jointLink!.indexOf(this.b1Link), 1);
    //   this.body2!.jointLink!.splice(this.body2!.jointLink!.indexOf(this.b2Link), 1);
    // }
    // else {
    let prev = this.b1Link.prev;
    let next = this.b1Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.body1!.jointLink == this.b1Link) this.body1!.jointLink = next;
    this.b1Link.prev = null;
    this.b1Link.next = null;
    this.b1Link.body = null;
    this.body1!.numJoints--;

    prev = this.b2Link.prev;
    next = this.b2Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.body2!.jointLink == this.b2Link) this.body2!.jointLink = next;
    this.b2Link.prev = null;
    this.b2Link.next = null;
    this.b2Link.body = null;
    this.body2!.numJoints--;
    // }

    this.b1Link.body = null;
    this.b2Link.body = null;
  }

  // Awake the bodies.

  awake(): void {
    this.body1!.awake();
    this.body2!.awake();
  }

  // calculation function
  preSolve(timeStep: f32, invTimeStep: f32): void {}

  solve(): void {}

  postSolve(): void {}

  // Delete process

  remove(): void {
    this.dispose();
  }

  dispose(): void {
    this.parent!.removeJoint(this);
  }

  // Three js add

  getPosition(): [Vec3, Vec3] {
    const p1 = new Vec3().scale(this.anchorPoint1, this.scale);
    const p2 = new Vec3().scale(this.anchorPoint2, this.scale);
    return [p1, p2];
  }
}
