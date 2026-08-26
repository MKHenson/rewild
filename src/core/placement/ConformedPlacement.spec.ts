import { IAssetPlacement } from 'models';
import { Quaternion, Vector3 } from 'rewild-common';
import {
  applyConformPolicy,
  IHeightfieldSampler,
  resolvePlacement,
  writeBackPlacement,
} from './ConformedPlacement';

/** A heightfield that ramps in x, so the slope normal is known exactly. */
function ramp(gradient: number, base = 0): IHeightfieldSampler {
  return {
    sampleHeight: (x) => base + gradient * x,
    sampleNormal: (_x, _z, out) => {
      out.set(-gradient, 1, 0).normalize();
      return true;
    },
  };
}

const emptyTerrain: IHeightfieldSampler = {
  sampleHeight: () => null,
  sampleNormal: () => false,
};

function placement(overrides: Partial<IAssetPlacement> = {}): IAssetPlacement {
  return {
    id: 'a',
    position: [10, 3, -4],
    rotation: [0, 0, 0, 1],
    ...overrides,
  };
}

describe('resolvePlacement', () => {
  const position = new Vector3();
  const rotation = new Quaternion();

  it('keeps the stored vec3 when the placement is not conformed', () => {
    expect(resolvePlacement(placement(), ramp(0, 50), position, rotation)).toBe(
      false
    );
    expect(position.y).toBe(3);
  });

  it('derives Y from the heightfield plus yOffset', () => {
    const result = resolvePlacement(
      placement({ conform: true, yOffset: 1.5 }),
      ramp(0, 50),
      position,
      rotation
    );

    expect(result).toBe(true);
    expect(position.x).toBe(10);
    expect(position.z).toBe(-4);
    expect(position.y).toBeCloseTo(51.5);
  });

  it('tracks the ground when the heights move under it', () => {
    const conformed = placement({ conform: true });
    resolvePlacement(conformed, ramp(0, 50), position, rotation);
    expect(position.y).toBeCloseTo(50);

    // The stored data never changed — only the heightfield did.
    resolvePlacement(conformed, ramp(0, 120), position, rotation);
    expect(position.y).toBeCloseTo(120);
  });

  it('falls back to the stored vec3 while the chunk has no heights', () => {
    expect(
      resolvePlacement(
        placement({ conform: true }),
        emptyTerrain,
        position,
        rotation
      )
    ).toBe(false);
    expect(position.y).toBe(3);
  });

  it('leaves rotation upright at alignToNormal 0', () => {
    resolvePlacement(
      placement({ conform: true, alignToNormal: 0 }),
      ramp(1),
      position,
      rotation
    );

    expect(rotation.x).toBeCloseTo(0);
    expect(rotation.y).toBeCloseTo(0);
    expect(rotation.z).toBeCloseTo(0);
    expect(rotation.w).toBeCloseTo(1);
  });

  it('takes local up onto the surface normal at alignToNormal 1', () => {
    resolvePlacement(
      placement({ conform: true, alignToNormal: 1 }),
      ramp(1),
      position,
      rotation
    );

    const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.x).toBeCloseTo(-Math.SQRT1_2);
    expect(up.y).toBeCloseTo(Math.SQRT1_2);
    expect(up.z).toBeCloseTo(0);
  });

  it('tilts partway at a fractional alignToNormal', () => {
    resolvePlacement(
      placement({ conform: true, alignToNormal: 0.5 }),
      ramp(1),
      position,
      rotation
    );

    const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.y).toBeGreaterThan(Math.SQRT1_2);
    expect(up.y).toBeLessThan(1);
    expect(up.x).toBeLessThan(0);
  });

  it('preserves the stored yaw while aligning', () => {
    // A quarter turn about Y: the aligned up must still be the surface normal.
    const s = Math.sin(Math.PI / 4);
    resolvePlacement(
      placement({ conform: true, alignToNormal: 1, rotation: [0, s, 0, s] }),
      ramp(1),
      position,
      rotation
    );

    const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.x).toBeCloseTo(-Math.SQRT1_2);
    expect(up.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('writeBackPlacement', () => {
  it('stores an absolute vec3 for an unconformed placement', () => {
    const target = placement();
    writeBackPlacement(target, ramp(0, 50), new Vector3(1, 2, 3), [0, 0, 0, 1]);

    expect(target.position).toEqual([1, 2, 3]);
    expect(target.yOffset).toBeUndefined();
  });

  it('converts Y into an offset above the sampled surface', () => {
    const target = placement({ conform: true });
    writeBackPlacement(
      target,
      ramp(0, 50),
      new Vector3(1, 52.5, 3),
      [0, 0, 0, 1]
    );

    expect(target.yOffset).toBeCloseTo(2.5);
  });

  it('round-trips a conformed drag without drifting', () => {
    const target = placement({ conform: true, alignToNormal: 1 });
    const terrain = ramp(1);
    const position = new Vector3();
    const rotation = new Quaternion();

    resolvePlacement(target, terrain, position, rotation);
    writeBackPlacement(target, terrain, position, [
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    ]);

    const position2 = new Vector3();
    const rotation2 = new Quaternion();
    resolvePlacement(target, terrain, position2, rotation2);

    expect(position2.y).toBeCloseTo(position.y);
    expect(rotation2.x).toBeCloseTo(rotation.x);
    expect(rotation2.y).toBeCloseTo(rotation.y);
    expect(rotation2.z).toBeCloseTo(rotation.z);
    expect(rotation2.w).toBeCloseTo(rotation.w);
  });

  it('leaves yOffset alone when the chunk has no heights', () => {
    const target = placement({ conform: true, yOffset: 4 });
    writeBackPlacement(
      target,
      emptyTerrain,
      new Vector3(1, 2, 3),
      [0, 0, 0, 1]
    );

    expect(target.yOffset).toBe(4);
    expect(target.position).toEqual([1, 2, 3]);
  });
});

describe('applyConformPolicy', () => {
  it('conforms and aligns what lands on terrain', () => {
    const target = placement();
    applyConformPolicy(target, true);

    expect(target.conform).toBe(true);
    expect(target.alignToNormal).toBe(1);
  });

  it('keeps an absolute Y for anything not on terrain', () => {
    // A crate on a platform: conforming would mean tracking a dependency on
    // geometry that can be moved or deleted, which nothing re-derives.
    const target = placement({ conform: true, yOffset: 3, alignToNormal: 1 });
    applyConformPolicy(target, false);

    expect(target.conform).toBe(false);
    expect(target.yOffset).toBe(0);
    expect(target.alignToNormal).toBe(0);
  });

  it('drives what writeBackPlacement then stores', () => {
    const terrain = ramp(0, 40);
    const onTerrain = placement();
    const offTerrain = placement();

    applyConformPolicy(onTerrain, true);
    applyConformPolicy(offTerrain, false);
    for (const target of [onTerrain, offTerrain])
      writeBackPlacement(target, terrain, new Vector3(0, 42, 0), [0, 0, 0, 1]);

    expect(onTerrain.yOffset).toBeCloseTo(2);
    expect(offTerrain.yOffset).toBe(0);
    expect(offTerrain.position[1]).toBe(42);
  });

  it('round-trips a drop onto terrain back to the drop point', () => {
    // The whole contract in one pass: place, store, reload.
    const terrain = ramp(0.5, 10);
    const dropped = placement();
    const position = new Vector3();
    const rotation = new Quaternion();

    applyConformPolicy(dropped, true);
    writeBackPlacement(
      dropped,
      terrain,
      new Vector3(6, 14.5, -2),
      [0, 0, 0, 1]
    );
    resolvePlacement(dropped, terrain, position, rotation);

    expect(position.x).toBe(6);
    expect(position.y).toBeCloseTo(14.5);
    expect(position.z).toBe(-2);
  });
});
