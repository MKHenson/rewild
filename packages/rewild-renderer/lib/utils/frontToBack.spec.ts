import { Box3, Vector3 } from 'rewild-common';
import { IS_SCATTER_INSTANCE_GROUP } from '../typeGuards';
import { nearestDrawDistance, sortFrontToBack } from './frontToBack';

function at(x: number, y: number, z: number) {
  const elements = new Float32Array(16);
  elements[0] = elements[5] = elements[10] = elements[15] = 1;
  elements[12] = x;
  elements[13] = y;
  elements[14] = z;
  return { matrixWorld: { elements } };
}

function mesh(x: number, bounds?: Box3) {
  return { transform: at(x, 0, 0), localBounds: bounds ?? null } as never;
}

function scatter(x: number, nearDistance = 0) {
  return {
    [IS_SCATTER_INSTANCE_GROUP]: true,
    transform: at(x, 0, 0),
    localBounds: new Box3(new Vector3(0, 0, 0), new Vector3(10, 10, 10)),
    nearDistance,
  } as never;
}

function group(meshes: never[]) {
  return { meshes, pass: {}, geometry: {} } as never;
}

const camera = at(0, 0, 0).matrixWorld.elements;

describe('nearestDrawDistance', () => {
  it('measures to the nearest point of the bounds', () => {
    const box = new Box3(new Vector3(-5, -1, -1), new Vector3(5, 1, 1));
    expect(nearestDrawDistance(mesh(20, box), camera)).toBeCloseTo(15);
  });

  it('is zero inside the bounds', () => {
    const box = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    expect(nearestDrawDistance(mesh(0, box), camera)).toBe(0);
  });

  it('measures to the origin without bounds', () => {
    expect(nearestDrawDistance(mesh(7), camera)).toBe(7);
  });

  it('puts a scatter tier no nearer than its band', () => {
    expect(nearestDrawDistance(scatter(0, 120), camera)).toBe(120);
  });
});

describe('sortFrontToBack', () => {
  it('orders groups by their nearest mesh', () => {
    const far = group([mesh(50), mesh(80)]);
    const near = group([mesh(90), mesh(5)]);
    const groups = [far, near];
    sortFrontToBack(groups, 0, 2, camera);
    expect(groups).toEqual([near, far]);
  });

  it('orders scatter meshes nearest first', () => {
    const a = scatter(100);
    const b = scatter(20);
    const g = group([a, b]) as { meshes: unknown[] };
    sortFrontToBack([g as never], 0, 1, camera);
    expect(g.meshes).toEqual([b, a]);
  });

  it('keeps the mesh order of other passes', () => {
    const a = mesh(100);
    const b = mesh(20);
    const g = group([a, b]) as { meshes: unknown[] };
    sortFrontToBack([g as never], 0, 1, camera);
    expect(g.meshes).toEqual([a, b]);
  });

  it('leaves groups outside the range alone', () => {
    const water = group([mesh(1)]);
    const solid = group([mesh(50)]);
    const groups = [solid, water];
    sortFrontToBack(groups, 0, 1, camera);
    expect(groups).toEqual([solid, water]);
  });
});
