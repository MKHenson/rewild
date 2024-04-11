import { Constraint } from './constraints';
import { ContactEquation } from './equations';
import { ContactMaterial } from './material';
import { Quaternion, Vec3 } from './math';
import { Body, BodyOptions } from './objects';
import { Box, Plane, Shape, Sphere } from './shapes';
import { GSSolver, SplitSolver } from './solver';
import { World } from './world';

export function createWorld(): World {
  return new World();
}

export function stepWorld(
  world: World,
  timeStep: f32,
  timeSinceLastCalled: f32 = 0,
  maxSubSteps: i32 = 10
): void {
  world.step(timeStep, timeSinceLastCalled, maxSubSteps);
}

export function getQuatX(quat: Quaternion): f32 {
  return quat.x;
}

export function getQuatY(quat: Quaternion): f32 {
  return quat.y;
}

export function getQuatZ(quat: Quaternion): f32 {
  return quat.z;
}

export function getQuatW(quat: Quaternion): f32 {
  return quat.w;
}

export function setVec3(v: Vec3, x: f32, y: f32, z: f32): void {
  v.set(x, y, z);
}

export function getVec3X(v: Vec3): f32 {
  return v.x;
}

export function getVec3Y(v: Vec3): f32 {
  return v.y;
}

export function getVec3Z(v: Vec3): f32 {
  return v.z;
}

export function getBodyPosition(body: Body): Vec3 {
  return body.position;
}

export function getBodyQuaternion(body: Body): Quaternion {
  return body.quaternion;
}

export function getBodyInterpolatedPosition(body: Body): Vec3 {
  return body.interpolatedPosition;
}

export function getBodyInterpolatedQuaternion(body: Body): Quaternion {
  return body.interpolatedQuaternion;
}

export function setWorldGravity(world: World, x: f32, y: f32, z: f32): void {
  world.gravity.set(x, y, z);
}

export function getWorldGravity(world: World): Vec3 {
  return world.gravity;
}

export function getWorldSolverIterations(world: World): i32 {
  if (world.solver instanceof SplitSolver) {
    return (world.solver as SplitSolver).iterations;
  } else if (world.solver instanceof GSSolver) {
    return (world.solver as GSSolver).iterations;
  }

  return 0;
}

export function getWorldQuatNormalizeSkip(world: World): i32 {
  return world.quatNormalizeSkip;
}

export function getWorldContactMaterial(world: World): ContactMaterial {
  return world.defaultContactMaterial;
}

export function setContactMaterialContactEquationData(
  material: ContactMaterial,
  stiffness: f32 = f32.NaN,
  relaxation: f32 = f32.NaN
): void {
  if (!isNaN(stiffness)) material.contactEquationStiffness = stiffness;
  if (!isNaN(relaxation)) material.contactEquationRelaxation = relaxation;
}

export function getWorldQuatNormalizeFast(world: World): boolean {
  return world.quatNormalizeFast;
}

export function createBodyOptions(): BodyOptions {
  return new BodyOptions();
}

export function setBodyOptionsMass(options: BodyOptions, mass: f32): void {
  options.mass = mass;
}

export function createBody(options: BodyOptions): Body {
  return new Body(options);
}

export function getWorldNumContacts(world: World): i32 {
  return world.contacts.length;
}

export function getWorlContactAt(world: World, index: i32): ContactEquation {
  return world.contacts[index];
}

export function worldAddConstraint(world: World, constraint: Constraint): void {
  world.addConstraint(constraint);
}

export function worldRemoveConstraint(
  world: World,
  constraint: Constraint
): void {
  world.removeConstraint(constraint);
}

export function addBodyToWorld(world: World, body: Body): void {
  world.addBody(body);
}

export function removeBodyFromWorld(world: World, body: Body): void {
  world.removeBody(body);
}

export function getShapeType(shape: Shape): i32 {
  return shape.type;
}

export function createShapePlane(): Shape {
  return new Plane();
}

export function createShapeBox(x: f32, y: f32, z: f32): Shape {
  return new Box(new Vec3(x, y, z));
}

export function createShapeSphere(radius: f32 = 1): Shape {
  return new Sphere(radius);
}

export function addShapeToBody(body: Body, shape: Shape): void {
  body.addShape(shape);
}

export function removeShapeFromBody(body: Body, shape: Shape): void {
  body.removeShape(shape);
}

export function setBodyPosition(body: Body, x: f32, y: f32, z: f32): void {
  body.position.set(x, y, z);
}

export function isBodyTrigger(body: Body): boolean {
  return body.isTrigger;
}

export function getBodyNumShapeOffsets(body: Body): i32 {
  return body.shapeOffsets.length;
}

export function getBodyNumShapeOrientations(body: Body): i32 {
  return body.shapeOrientations.length;
}

export function getBodyShapeOffsetAt(body: Body, index: i32): Vec3 {
  return body.shapeOffsets[index];
}

export function getBodyShapeOrientationAt(body: Body, index: i32): Quaternion {
  return body.shapeOrientations[index];
}

export function setBodyQuaternion(
  body: Body,
  x: f32,
  y: f32,
  z: f32,
  w: f32
): void {
  body.quaternion.set(x, y, z, w);
}

export function setBodyQuaternionFromEuler(
  body: Body,
  x: f32,
  y: f32,
  z: f32
): void {
  body.quaternion.setFromEuler(x, y, z);
}

export function setBodyVelocity(body: Body, x: f32, y: f32, z: f32): void {
  body.velocity.set(x, y, z);
}

export function setBodyAngularVelocity(
  body: Body,
  x: f32,
  y: f32,
  z: f32
): void {
  body.angularVelocity.set(x, y, z);
}

export function setBodyMass(body: Body, mass: f32): void {
  body.mass = mass;
}
