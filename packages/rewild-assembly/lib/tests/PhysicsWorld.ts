import {
  Body,
  ContactEquation,
  ContactMaterial,
  Heightfield,
  Material,
  Narrowphase,
  Quaternion,
  Shape,
  Sphere,
  Vec3,
  World,
  WorldOptions,
} from 'rewild-physics';

export function createPhysicsWorld(): World {
  return new World(new WorldOptions());
}

export function createPhysicsNarrowphase(world: World): Narrowphase {
  const toReturn = new Narrowphase(world);
  const result: ContactEquation[] = [];
  toReturn.currentContactMaterial = new ContactMaterial(
    new Material('default'),
    new Material('default')
  );
  toReturn.result = result;
  return toReturn;
}

export function physicsNarrowPhaseSphereHeightfield(
  phase: Narrowphase,
  sphere: Sphere,
  heightfield: Heightfield,
  spherePosition: Vec3,
  hfPosition: Vec3,
  sphereQuat: Quaternion,
  hfQuat: Quaternion,
  sphereBody: Body,
  hfBody: Body
): void {
  phase.sphereHeightfield(
    sphere,
    heightfield,
    spherePosition,
    hfPosition,
    sphereQuat,
    hfQuat,
    sphereBody,
    hfBody
  );
}

export function physicsNarrowPhaseSphereSphere(
  phase: Narrowphase,
  sphereI: Sphere,
  sphereJ: Sphere,
  sphereAPosition: Vec3,
  sphereBPosition: Vec3,
  sphereAQuat: Quaternion,
  sphereBQuat: Quaternion,
  sphereABody: Body,
  sphereBBody: Body
): void {
  phase.sphereSphere(
    sphereI,
    sphereJ,
    sphereAPosition,
    sphereBPosition,
    sphereAQuat,
    sphereBQuat,
    sphereABody,
    sphereBBody
  );
}

export function physicsNarrowPhaseResultLen(phase: Narrowphase): i32 {
  return phase.result.length;
}
