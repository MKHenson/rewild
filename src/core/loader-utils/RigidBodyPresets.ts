import { PhysicsComponent, wasm } from 'rewild-wasmtime';

export type RigidBodyPresetType = 'crate';

export const RigidBodyProfiles: {
  [key in RigidBodyPresetType]: () => PhysicsComponent;
} = {
  crate: () => {
    const physicsComponent = new PhysicsComponent(
      wasm.createBodyBox(0.5, 0.5, 0.5, 30)
    );
    physicsComponent.mass = 30;
    return physicsComponent;
  },
};
