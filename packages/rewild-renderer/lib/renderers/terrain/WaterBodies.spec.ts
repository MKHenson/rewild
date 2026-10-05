/** @jest-environment node */
import type { WaterBody } from './Lakes';
import { deserializeWaterBodies, serializeWaterBodies } from './WaterBodies';

const body = (overrides: Partial<WaterBody> = {}): WaterBody => ({
  id: 0x80010002,
  level: 12.5,
  spillHeight: 13.25,
  typeWeights: [0, 1, 0, 0],
  ...overrides,
});

const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;

describe('water body records', () => {
  it('round-trips', () => {
    const bodies = [body(), body({ id: 5, level: -1 })];
    expect(deserializeWaterBodies(serializeWaterBodies(bodies))).toEqual(
      bodies
    );
  });

  it('pads short palette weights', () => {
    const [read] = deserializeWaterBodies(
      encode({ version: 1, bodies: [{ ...body(), typeWeights: [1] }] })
    );
    expect(read.typeWeights).toEqual([1, 0, 0, 0]);
  });

  it('rejects another version', () => {
    expect(() =>
      deserializeWaterBodies(encode({ version: 99, bodies: [] }))
    ).toThrow('Unsupported');
  });

  it('rejects a malformed record', () => {
    expect(() =>
      deserializeWaterBodies(
        encode({ version: 1, bodies: [{ ...body(), level: 'high' }] })
      )
    ).toThrow('Malformed');
  });

  it('ignores fields it does not know', () => {
    const [read] = deserializeWaterBodies(
      encode({ version: 1, bodies: [{ ...body(), locked: true }] })
    );
    expect(read).toEqual(body());
  });
});
