import { Body, BodyOptions, Material, Sphere, Vec3 } from "rewild-physics";
import { Component } from "../core/Component";
import { Runtime } from "../objects/routing";

export class PhysicsComponent extends Component {
  rigidBody: Body;
  dataProperties: Float32Array;

  constructor() {
    super("physics");

    const sphereOptions = new BodyOptions()
      .setPosition(new Vec3(0, 0, 0))
      .setShape(new Sphere(1))
      .setMass(30)
      .setMaterial(new Material("sphere", 0.1, 0.7));
    const sphereBody = new Body(sphereOptions);
    sphereBody.linearDamping = 0.05;

    this.rigidBody = sphereBody;
    this.dataProperties = new Float32Array(10);
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
    this.rigidBody.position.set(this.positionX, this.positionY, this.positionZ);
    this.rigidBody.velocity.set(this.velocityX, this.velocityY, this.velocityZ);
    this.rigidBody.angularVelocity.set(
      this.angularVelocityX,
      this.angularVelocityY,
      this.angularVelocityZ
    );
    this.rigidBody.mass = this.mass;
    runtime.world.add(this.rigidBody);
  }

  unMount(runtime: Runtime): void {
    runtime.world.removeBody(this.rigidBody);
  }

  get positionX(): f32 {
    return unchecked(this.dataProperties[0]);
  }
  set positionX(val: f32) {
    unchecked((this.dataProperties[0] = val));
  }

  get positionY(): f32 {
    return unchecked(this.dataProperties[1]);
  }
  set positionY(val: f32) {
    unchecked((this.dataProperties[1] = val));
  }

  get positionZ(): f32 {
    return unchecked(this.dataProperties[2]);
  }
  set positionZ(val: f32) {
    unchecked((this.dataProperties[2] = val));
  }

  get velocityX(): f32 {
    return unchecked(this.dataProperties[3]);
  }
  set velocityX(val: f32) {
    unchecked((this.dataProperties[3] = val));
  }

  get velocityY(): f32 {
    return unchecked(this.dataProperties[4]);
  }
  set velocityY(val: f32) {
    unchecked((this.dataProperties[4] = val));
  }
  get velocityZ(): f32 {
    return unchecked(this.dataProperties[5]);
  }
  set velocityZ(val: f32) {
    unchecked((this.dataProperties[5] = val));
  }

  get angularVelocityX(): f32 {
    return unchecked(this.dataProperties[6]);
  }
  set angularVelocityX(val: f32) {
    unchecked((this.dataProperties[6] = val));
  }

  get angularVelocityY(): f32 {
    return unchecked(this.dataProperties[7]);
  }
  set angularVelocityY(val: f32) {
    unchecked((this.dataProperties[7] = val));
  }

  get angularVelocityZ(): f32 {
    return unchecked(this.dataProperties[8]);
  }
  set angularVelocityZ(val: f32) {
    unchecked((this.dataProperties[8] = val));
  }

  get mass(): f32 {
    return unchecked(this.dataProperties[9]);
  }
  set mass(val: f32) {
    unchecked((this.dataProperties[9] = val));
  }
}

export function createPhysicsComponent(): Component {
  return new PhysicsComponent();
}

export function getPhysicsComponentProperties(
  component: PhysicsComponent
): usize {
  return changetype<usize>(component.dataProperties);
}
