import { Body } from "rewild-physics";
import { Component } from "../core/Component";
import { Runtime } from "../objects/routing";

export class PhysicsComponent extends Component {
  rigidBody: Body;

  constructor(rigidBody: Body) {
    super("physics");

    this.rigidBody = rigidBody;
  }

  onUpdate(delta: f32, total: u32): void {
    if (this.transform) {
      const bodyPos = this.rigidBody.interpolatedPosition;
      const bodyQuat = this.rigidBody.interpolatedQuaternion;
      this.transform!.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
      this.transform!.quaternion.set(
        bodyQuat.x,
        bodyQuat.y,
        bodyQuat.z,
        bodyQuat.w
      );
    }
  }

  mount(runtime: Runtime): void {
    runtime.world.add(this.rigidBody);
  }

  unMount(runtime: Runtime): void {
    runtime.world.removeBody(this.rigidBody);
  }
}

export function createPhysicsComponent(rigidBody: Body): PhysicsComponent {
  return new PhysicsComponent(rigidBody);
}
