import * as R from '@dimforge/rapier3d-compat';
import {
  PhysicsShape,
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
} from 'rewild-renderer';
import {
  createColliderDesc,
  createScatterColliderDesc,
} from './ColliderShapes';

function instance(
  position: [number, number, number],
  rotation: [number, number, number, number] = [0, 0, 0, 1],
  scale = 1
): ScatterInstances {
  const data = new Float32Array(SCATTER_INSTANCE_STRIDE * 2);
  data.set([...position, ...rotation, scale, 0], SCATTER_INSTANCE_STRIDE);
  return { layer: 'oak_01', slot: 0, count: 2, data };
}

const trunk: PhysicsShape = {
  type: 'capsule',
  radius: 0.5,
  height: 3,
  offset: [0, 2, 0],
};

describe('createColliderDesc', () => {
  it('halves a box for Rapier', () => {
    const desc = createColliderDesc(R, { type: 'box', size: [2, 4, 6] });
    const shape = desc.shape as R.Cuboid;
    expect(shape.type).toBe(R.ShapeType.Cuboid);
    expect(shape.halfExtents).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('keeps a sphere radius as authored', () => {
    const desc = createColliderDesc(R, { type: 'sphere', radius: 1.5 });
    expect((desc.shape as R.Ball).radius).toBe(1.5);
  });

  it('gives a capsule the half-height of its cylindrical section', () => {
    const desc = createColliderDesc(R, trunk);
    const shape = desc.shape as R.Capsule;
    expect(shape.type).toBe(R.ShapeType.Capsule);
    expect(shape.halfHeight).toBe(1.5);
    expect(shape.radius).toBe(0.5);
  });

  it('places the offset relative to the body', () => {
    expect(createColliderDesc(R, trunk).translation).toEqual({
      x: 0,
      y: 2,
      z: 0,
    });
    expect(
      createColliderDesc(R, { type: 'sphere', radius: 1 }).translation
    ).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('scales dimensions and offset together', () => {
    const desc = createColliderDesc(R, trunk, 2);
    const shape = desc.shape as R.Capsule;
    expect(shape.halfHeight).toBe(3);
    expect(shape.radius).toBe(1);
    expect(desc.translation).toEqual({ x: 0, y: 4, z: 0 });
  });

  it('scales every hull point by the instance scale', () => {
    const hull: PhysicsShape = {
      type: 'hull',
      points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    const shape = createColliderDesc(R, hull, 2).shape as R.ConvexPolyhedron;
    expect(Array.from(shape.vertices)).toEqual([
      0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2,
    ]);
  });

  it('reuses one scaled buffer per hull shape', () => {
    const hull: PhysicsShape = {
      type: 'hull',
      points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    const a = createColliderDesc(R, hull, 1).shape as R.ConvexPolyhedron;
    const b = createColliderDesc(R, hull, 3).shape as R.ConvexPolyhedron;
    expect(b.vertices).toBe(a.vertices);
    expect(b.vertices[3]).toBe(3);
  });
});

describe('createScatterColliderDesc', () => {
  it('poses an unrotated instance at its world position plus the offset', () => {
    const desc = createScatterColliderDesc(
      R,
      trunk,
      instance([3, 10, -4]),
      1,
      100,
      0,
      200
    );
    expect(desc.translation).toEqual({ x: 103, y: 12, z: 196 });
    expect(desc.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('carries the offset through the instance rotation', () => {
    // A quarter turn about z lays local +y along world -x.
    const half = Math.SQRT1_2;
    const desc = createScatterColliderDesc(
      R,
      trunk,
      instance([0, 0, 0], [0, 0, half, half]),
      1,
      0,
      0,
      0
    );
    expect(desc.translation.x).toBeCloseTo(-2);
    expect(desc.translation.y).toBeCloseTo(0);
    expect(desc.translation.z).toBeCloseTo(0);
    expect(desc.rotation.x).toBeCloseTo(0);
    expect(desc.rotation.y).toBeCloseTo(0);
    expect(desc.rotation.z).toBeCloseTo(half);
    expect(desc.rotation.w).toBeCloseTo(half);
  });

  it('scales the shape and its offset by the instance scale', () => {
    const desc = createScatterColliderDesc(
      R,
      trunk,
      instance([0, 5, 0], [0, 0, 0, 1], 1.5),
      1,
      0,
      0,
      0
    );
    const shape = desc.shape as R.Capsule;
    expect(shape.halfHeight).toBeCloseTo(2.25);
    expect(shape.radius).toBeCloseTo(0.75);
    expect(desc.translation.y).toBeCloseTo(8);
  });

  it('does not share rotation state between descs', () => {
    const a = createScatterColliderDesc(
      R,
      trunk,
      instance([0, 0, 0], [0, 1, 0, 0]),
      1,
      0,
      0,
      0
    );
    const b = createScatterColliderDesc(
      R,
      trunk,
      instance([0, 0, 0]),
      1,
      0,
      0,
      0
    );
    expect(a.rotation.y).toBe(1);
    expect(b.rotation.y).toBe(0);
  });

  it('rejects an index outside the layer', () => {
    expect(() =>
      createScatterColliderDesc(R, trunk, instance([0, 0, 0]), 2, 0, 0, 0)
    ).toThrow(/out of range/);
  });
});
