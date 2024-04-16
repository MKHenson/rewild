import { Constraint } from './constraints';
import { ContactEquation } from './equations';
import { ContactMaterial, Material } from './material';
import { Quaternion, Vec3 } from './math';
import { Body, BodyOptions } from './objects';
import {
  Box,
  ConvexPolyhedron,
  Cylinder,
  Heightfield,
  Plane,
  Shape,
  Sphere,
} from './shapes';
import { GSSolver, Solver, SplitSolver } from './solver';
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

export function setQuatX(quat: Quaternion, x: f32): void {
  quat.x = x;
}

export function getQuatY(quat: Quaternion): f32 {
  return quat.y;
}

export function setQuatY(quat: Quaternion, y: f32): void {
  quat.y = y;
}

export function getQuatZ(quat: Quaternion): f32 {
  return quat.z;
}

export function setQuatZ(quat: Quaternion, z: f32): void {
  quat.z = z;
}

export function getQuatW(quat: Quaternion): f32 {
  return quat.w;
}

export function setQuatW(quat: Quaternion, w: f32): void {
  quat.w = w;
}

export function setVec3(v: Vec3, x: f32, y: f32, z: f32): void {
  v.set(x, y, z);
}

export function getVec3X(v: Vec3): f32 {
  return v.x;
}

export function setVec3X(v: Vec3, x: f32): void {
  v.x = x;
}

export function getVec3Y(v: Vec3): f32 {
  return v.y;
}

export function setVec3Y(v: Vec3, y: f32): void {
  v.y = y;
}

export function getVec3Z(v: Vec3): f32 {
  return v.z;
}

export function setVec3Z(v: Vec3, z: f32): void {
  v.z = z;
}

export function createVec3(): Vec3 {
  return new Vec3();
}

export function getBoxConvexPolyhedronRepresentation(
  box: Shape
): ConvexPolyhedron {
  return (box as Box).convexPolyhedronRepresentation!;
}

export function createCylinder(
  radiusTop: f32 = 1,
  radiusBottom: f32 = 1,
  height: f32 = 1,
  numSegments: i32 = 8
): Shape {
  return new Cylinder(radiusTop, radiusBottom, height, numSegments);
}

export function createContactMaterial(
  materialA: Material,
  materialB: Material,
  friction: f32 = -1,
  restitution: f32 = -1,
  contactEquationStiffness: f32 = 1e7,
  contactEquationRelaxation: f32 = 3,
  frictionEquationStiffness: f32 = 1e7,
  frictionEquationRelaxation: f32 = 3
): ContactMaterial {
  return new ContactMaterial(
    materialA,
    materialB,
    friction,
    restitution,
    contactEquationStiffness,
    contactEquationRelaxation,
    frictionEquationStiffness,
    frictionEquationRelaxation
  );
}

export function getBodyPosition(body: Body): Vec3 {
  return body.position;
}

export function getBodyVelocity(body: Body): Vec3 {
  return body.velocity;
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

export function setBodyOptionsType(options: BodyOptions, type: i32): void {
  options.type = type;
}

export function setBodyOptionsPosition(
  options: BodyOptions,
  x: f32,
  y: f32,
  z: f32
): void {
  options.position.set(x, y, z);
}

export function setBodyOptionsVelocity(
  options: BodyOptions,
  x: f32,
  y: f32,
  z: f32
): void {
  options.velocity.set(x, y, z);
}

export function setBodyOptionsAngularVelocity(
  options: BodyOptions,
  x: f32,
  y: f32,
  z: f32
): void {
  options.angularVelocity.set(x, y, z);
}

export function setBodyOptionsQuaternion(
  options: BodyOptions,
  x: f32,
  y: f32,
  z: f32,
  w: f32
): void {
  options.quaternion.set(x, y, z, w);
}

export function setBodyOptionsMaterial(
  options: BodyOptions,
  material: Material
): void {
  options.material = material;
}

export function setBodyOptionsLinearDamping(
  options: BodyOptions,
  damping: f32
): void {
  options.linearDamping = damping;
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

export function addContactMaterialToWorld(
  world: World,
  contactMaterial: ContactMaterial
): void {
  world.addContactMaterial(contactMaterial);
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

export function addShapeToBody(
  body: Body,
  shape: Shape,
  offsetX: f32 = 0,
  offsetY: f32 = 0,
  offsetZ: f32 = 0
): void {
  body.addShape(shape, new Vec3(offsetX, offsetY, offsetZ));
}

export function removeShapeFromBody(body: Body, shape: Shape): void {
  body.removeShape(shape);
}

export function setBodyPosition(body: Body, x: f32, y: f32, z: f32): void {
  body.position.set(x, y, z);
}

export function setBodyLinearDamping(body: Body, damping: f32): void {
  body.linearDamping = damping;
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

export function createMaterial(
  name: string = '',
  friction: f32 = -1,
  restitution: f32 = -1
): Material {
  return new Material(name, friction, restitution);
}

export function setQuaternionFromEuler(
  quat: Quaternion,
  x: f32,
  y: f32,
  z: f32
): void {
  quat.setFromEuler(x, y, z);
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

export function getWorldSolver(world: World): Solver {
  return world.solver;
}

export function setSolverIterations(solver: Solver, iterations: i32): void {
  (solver as GSSolver).iterations = iterations;
}

export function createConvexPolyhedron(
  vertices: f32[],
  faces: i32[],
  facesSize: i32
): Shape {
  const verts = new Array<Vec3 | null>();
  const facesArray: (Array<i32> | null)[] = [];

  for (let i = 0; i < vertices.length; i += 3) {
    verts.push(new Vec3(vertices[i], vertices[i + 1], vertices[i + 2]));
  }

  for (let i = 0; i < faces.length; i += facesSize) {
    const face = new Array<i32>();
    for (let j = 0; j < facesSize; j++) {
      face.push(faces[i + j]);
    }
    facesArray.push(face);
  }

  return new ConvexPolyhedron(verts, facesArray);
}

export function createHeightfield(
  data: f32[],
  matrixSizeX: i32,
  matrixSizeZ: i32,
  elementSize: f32
): Shape {
  // Convert the f32[] to a f32[][] based on the matrix sizes
  const matrix = new Array<Array<f32>>();
  for (let i = 0; i < matrixSizeX; i++) {
    const row = new Array<f32>();
    for (let j = 0; j < matrixSizeZ; j++) {
      row.push(data[i * matrixSizeZ + j]);
    }
    matrix.push(row);
  }

  return new Heightfield(matrix, f32.NaN, f32.NaN, elementSize);
}

export function getHeightfieldConvexTrianglePillar(
  heightfield: Heightfield,
  xi: i32,
  yi: i32,
  k: boolean
): void {
  return heightfield.getConvexTrianglePillar(xi, yi, k);
}

export function getHeightfieldPillarConvexAt(
  heightfield: Heightfield,
  i: i32
): Vec3 {
  return heightfield.pillarConvex.vertices[i]!;
}

export function getHeightfieldPillarOffset(heightfield: Heightfield): Vec3 {
  return heightfield.pillarOffset;
}

export function vec3VAdd(source: Vec3, v: Vec3, w: Vec3): Vec3 {
  return source.vadd(v, w);
}
