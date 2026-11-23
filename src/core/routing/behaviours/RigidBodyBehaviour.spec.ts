import * as R from '@dimforge/rapier3d-compat';
import { Transform } from 'rewild-renderer';
import { Asset3D } from '../Asset3D';
import { RigidBodyBehaviour } from './RigidBodyBehaviour';

function bodyAsset(world: R.World): Asset3D {
  const rb = world.createRigidBody(R.RigidBodyDesc.dynamic());
  world.createCollider(R.ColliderDesc.ball(0.5), rb);
  const asset = new Asset3D(new Transform());
  asset.addBehavior(new RigidBodyBehaviour(rb, world));
  return asset;
}

describe('RigidBodyBehaviour', () => {
  let world: R.World;

  beforeAll(async () => {
    await R.init();
  });

  beforeEach(() => {
    world = new R.World({ x: 0, y: -9.81, z: 0 });
  });

  afterEach(() => {
    world.free();
  });

  it('takes its body and colliders out of the world when the asset is disposed', () => {
    const kept = bodyAsset(world);
    const disposed = bodyAsset(world);
    expect(world.bodies.len()).toBe(2);
    expect(world.colliders.len()).toBe(2);

    disposed.dispose();
    expect(world.bodies.len()).toBe(1);
    expect(world.colliders.len()).toBe(1);
    expect(disposed.behaviours).toEqual([]);
    expect(kept.behaviours).toHaveLength(1);
  });

  it('removes the body once when the asset is disposed twice', () => {
    const asset = bodyAsset(world);
    asset.dispose();
    asset.dispose();
    expect(world.bodies.len()).toBe(0);
  });
});
