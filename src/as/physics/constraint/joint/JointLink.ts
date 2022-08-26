import { RigidBody } from "../../core/RigidBody";
import { Joint } from "./Joint";

export class JointLink {
  // The previous joint link.
  prev: JointLink | null;
  // The next joint link.
  next: JointLink | null;
  // The other rigid body connected to the joint.
  body: RigidBody | null;
  // The joint of the link.
  joint: Joint;

  constructor(joint: Joint) {
    this.prev = null;
    this.next = null;
    this.body = null;
    this.joint = joint;
  }
}
