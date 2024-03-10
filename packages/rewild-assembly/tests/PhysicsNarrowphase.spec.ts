import { init, wasm } from './utils/wasm-module';

describe('Heightfield', () => {
  beforeAll(async () => {
    await init();
  });

  it('correctly tests the sphereSphere collision', () => {
    const world = wasm.createPhysicsWorld();
    const cg = wasm.createPhysicsNarrowphase(world);
    const sphereShape = wasm.createPhysicsSphere(1);
    const bodyA = wasm.physicsCreateBodyForSphere(1, sphereShape);
    const bodyB = wasm.physicsCreateBodyForSphere(1, sphereShape);

    wasm.physicsNarrowPhaseSphereSphere(
      cg,
      sphereShape,
      sphereShape,
      wasm.createPhysicsVec3(0.5, 0, 0),
      wasm.createPhysicsVec3(-0.5, 0, 0),
      wasm.createPhysicsQuaternion(0, 0, 0, 1),
      wasm.createPhysicsQuaternion(0, 0, 0, 1),
      bodyA,
      bodyB
    );

    expect(wasm.physicsNarrowPhaseResultLen(cg)).toBe(1);
  });

  it('correctly tests the sphereHeightfield collision', () => {
    const world = wasm.createPhysicsWorld();
    const cg = wasm.createPhysicsNarrowphase(world);
    const hfShape = wasm.createHeightfield(
      1,
      false,
      20,
      wasm.f32NaN(),
      wasm.f32NaN(),
      0
    );
    const sphereShape = wasm.createPhysicsSphere(0.1);
    const spherePos = wasm.createPhysicsVec3(0.25, 0.25, 0.05);
    const hfPos = wasm.createPhysicsVec3(0, 0, 0);
    const sphereQuat = wasm.createPhysicsQuaternion(0, 0, 0, 1);
    const hfQuat = wasm.createPhysicsQuaternion(0, 0, 0, 1);
    const bodySphere = wasm.physicsCreateBodyForSphere(1, sphereShape);
    const bodyHf = wasm.physicsCreateBodyForHeightfield(hfShape, 1);

    wasm.physicsNarrowPhaseSphereHeightfield(
      cg,
      sphereShape,
      hfShape,
      spherePos, // hit the first triangle in the field
      hfPos,
      sphereQuat,
      hfQuat,
      bodySphere,
      bodyHf
    );

    expect(wasm.physicsNarrowPhaseResultLen(cg)).toBe(1);
  });
});
