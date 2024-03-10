import { Vec3, Quaternion, Sphere, Body, BodyOptions } from 'rewild-physics';

export function createPhysicsVec3(x: f32, y: f32, z: f32): Vec3 {
  return new Vec3(x, y, z);
}

export function createPhysicsQuaternion(
  x: f32,
  y: f32,
  z: f32,
  w: f32
): Quaternion {
  return new Quaternion(x, y, z, w);
}

export function createPhysicsSphere(radius: f32): Sphere {
  return new Sphere(radius);
}

export function physicsVec3X(vec: Vec3): f32 {
  return vec.x;
}

export function physicsVec3Y(vec: Vec3): f32 {
  return vec.y;
}

export function physicsVec3Z(vec: Vec3): f32 {
  return vec.z;
}

export function physicsQuaternionX(quat: Quaternion): f32 {
  return quat.x;
}

export function physicsQuaternionY(quat: Quaternion): f32 {
  return quat.y;
}

export function physicsQuaternionZ(quat: Quaternion): f32 {
  return quat.z;
}

export function physicsQuaternionW(quat: Quaternion): f32 {
  return quat.w;
}

export function physicsSphereRadius(sphere: Sphere): f32 {
  return sphere.radius;
}

export function physicsCreateBodyForSphere(mass: f32, sphere: Sphere): Body {
  const body = new Body();
  body.addShape(sphere);
  body.mass = mass;
  return body;
}
