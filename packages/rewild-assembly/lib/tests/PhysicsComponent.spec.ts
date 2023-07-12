import { PhysicsComponent } from "../components/PhysicsComponent";
export {
  createPhysicsComponent,
  getPhysicsComponentProperties,
} from "../components/PhysicsComponent";

export function getPhysicsComponentMass(component: PhysicsComponent): f32 {
  return component.mass;
}

export function setPhysicsComponentMass(
  component: PhysicsComponent,
  val: f32
): void {
  component.mass = val;
}

export function getPhysicsComponentPosX(component: PhysicsComponent): f32 {
  return component.positionX;
}
export function setPhysicsComponentPosX(
  component: PhysicsComponent,
  val: f32
): void {
  component.positionX = val;
}

export function getPhysicsComponentPosY(component: PhysicsComponent): f32 {
  return component.positionY;
}

export function setPhysicsComponentPosY(
  component: PhysicsComponent,
  val: f32
): void {
  component.positionY = val;
}

export function getPhysicsComponentPosZ(component: PhysicsComponent): f32 {
  return component.positionZ;
}

export function setPhysicsComponentPosZ(
  component: PhysicsComponent,
  val: f32
): void {
  component.positionZ = val;
}

export function getPhysicsComponentVelX(component: PhysicsComponent): f32 {
  return component.velocityX;
}

export function setPhysicsComponentVelX(
  component: PhysicsComponent,
  val: f32
): void {
  component.velocityX = val;
}

export function getPhysicsComponentVelY(component: PhysicsComponent): f32 {
  return component.velocityY;
}

export function setPhysicsComponentVelY(
  component: PhysicsComponent,
  val: f32
): void {
  component.velocityY = val;
}

export function getPhysicsComponentVelZ(component: PhysicsComponent): f32 {
  return component.velocityZ;
}

export function setPhysicsComponentVelZ(
  component: PhysicsComponent,
  val: f32
): void {
  component.velocityZ = val;
}

export function getPhysicsComponentAngVelX(component: PhysicsComponent): f32 {
  return component.angularVelocityX;
}

export function setPhysicsComponentAngVelX(
  component: PhysicsComponent,
  val: f32
): void {
  component.angularVelocityX = val;
}

export function getPhysicsComponentAngVelY(component: PhysicsComponent): f32 {
  return component.angularVelocityY;
}

export function setPhysicsComponentAngVelY(
  component: PhysicsComponent,
  val: f32
): void {
  component.angularVelocityY = val;
}

export function getPhysicsComponentAngVelZ(component: PhysicsComponent): f32 {
  return component.angularVelocityZ;
}
