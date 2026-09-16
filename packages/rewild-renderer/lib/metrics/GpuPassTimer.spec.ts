import { derivePassCosts, PassReading } from './GpuPassTimer';

const ns = (ms: number) => BigInt(Math.round(ms * 1_000_000));

const reading = (label: string, begin: number, end: number): PassReading => ({
  label,
  begin: ns(begin),
  end: ns(end),
});

describe('derivePassCosts', () => {
  it('uses the measured duration when every pass has its own begin', () => {
    // A real scene capture. The passes overlap by 0.9ms, one draining while the
    // next starts, so the costs are allowed to sum past the buffer's wall time.
    const costs = derivePassCosts([
      reading('shadow', 0, 3.277),
      reading('scene', 2.359, 10.813),
    ]);

    expect(costs.get('shadow')).toBeCloseTo(3.277, 3);
    expect(costs.get('scene')).toBeCloseTo(8.454, 3);
  });

  it('derives from the end timeline when begins collapse', () => {
    // A real sky capture. Only cloud-shadow kept its own begin; the three after
    // it all report the start of the command buffer, so their raw durations
    // read 10.813, 11.076 and 11.272 rather than their own costs.
    const costs = derivePassCosts([
      reading('cloud-shadow', 0, 9.175),
      reading('clouds', 0.066, 10.879),
      reading('atmosphere', 0.066, 11.141),
      reading('bilateral', 0.066, 11.338),
    ]);

    expect(costs.get('cloud-shadow')).toBeCloseTo(9.175, 3);
    expect(costs.get('clouds')).toBeCloseTo(1.704, 3);
    expect(costs.get('atmosphere')).toBeCloseTo(0.262, 3);
    expect(costs.get('bilateral')).toBeCloseTo(0.197, 3);
  });

  it('orders by end rather than by the order passes were handed in', () => {
    const costs = derivePassCosts([
      reading('third', 1, 9),
      reading('first', 1, 3),
      reading('second', 1, 5),
    ]);

    expect(costs.get('first')).toBeCloseTo(2, 3);
    expect(costs.get('second')).toBeCloseTo(2, 3);
    expect(costs.get('third')).toBeCloseTo(4, 3);
  });

  it('never reports a negative cost', () => {
    const costs = derivePassCosts([reading('backwards', 5, 1)]);
    expect(costs.get('backwards')).toBe(0);
  });

  it('returns nothing for an empty readback', () => {
    expect(derivePassCosts([]).size).toBe(0);
  });
});
