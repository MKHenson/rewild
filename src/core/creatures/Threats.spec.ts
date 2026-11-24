import { Vector3 } from 'rewild-common';
import { Threat, ThreatField, createThreatSample } from './Threats';

function threat(x: number, fright = 1, present = true): Threat {
  return {
    fright,
    position: (out: Vector3) => {
      out.set(x, 0, 0);
      return present;
    },
  };
}

describe('ThreatField', () => {
  it('finds nothing with no threats', () => {
    expect(new ThreatField().nearest(0, 0, 0, 10, createThreatSample())).toBe(
      false
    );
  });

  it('finds the nearest threat inside the reach', () => {
    const field = new ThreatField();
    field.add(threat(8));
    field.add(threat(3));
    const out = createThreatSample();
    expect(field.nearest(0, 0, 0, 10, out)).toBe(true);
    expect(out.x).toBe(3);
    expect(out.distance).toBe(3);
  });

  it('scales the reach by fright', () => {
    const field = new ThreatField();
    field.add(threat(12, 2));
    const out = createThreatSample();
    expect(field.nearest(0, 0, 0, 5, out)).toBe(false);
    expect(field.nearest(0, 0, 0, 7, out)).toBe(true);
    expect(out.fright).toBe(2);
  });

  it('prefers the threat that frightens most for its distance', () => {
    const field = new ThreatField();
    field.add(threat(3));
    field.add(threat(4, 4));
    const out = createThreatSample();
    field.nearest(0, 0, 0, 10, out);
    expect(out.x).toBe(4);
  });

  it('skips threats that are nowhere, and removed ones', () => {
    const field = new ThreatField();
    const gone = threat(1);
    field.add(threat(2, 1, false));
    field.add(gone);
    field.remove(gone);
    expect(field.nearest(0, 0, 0, 10, createThreatSample())).toBe(false);
  });
});
