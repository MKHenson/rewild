import { Matrix4 } from 'rewild-common';
import { widenProjection } from './TerrainRenderer';

describe('widenProjection', () => {
  const halfAngle = (scale: number) => Math.atan(1 / Math.abs(scale));

  it('widens a perspective view by the margin on each axis', () => {
    const projection = new Matrix4().makePerspective(-1, 1, 0.5, -0.5, 1, 100);
    const before = projection.elements.slice();
    widenProjection(projection, 0.2);
    const e = projection.elements;
    expect(halfAngle(e[0])).toBeCloseTo(halfAngle(before[0]) + 0.2);
    expect(halfAngle(e[5])).toBeCloseTo(halfAngle(before[5]) + 0.2);
    expect(Math.sign(e[0])).toBe(Math.sign(before[0]));
    expect(e[10]).toBe(before[10]);
    expect(e[14]).toBe(before[14]);
  });

  it('stops short of a half turn', () => {
    const projection = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100);
    widenProjection(projection, Math.PI);
    expect(Number.isFinite(projection.elements[0])).toBe(true);
    expect(projection.elements[0]).toBeGreaterThan(0);
  });

  it('leaves an orthographic view alone', () => {
    const projection = new Matrix4().makeOrthographic(-1, 1, 1, -1, 1, 100);
    const before = projection.elements.slice();
    widenProjection(projection, 0.2);
    expect(Array.from(projection.elements)).toEqual(Array.from(before));
  });
});
