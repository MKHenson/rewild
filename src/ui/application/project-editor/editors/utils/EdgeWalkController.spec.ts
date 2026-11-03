import { Vector3 } from 'rewild-common';
import { edgeCursor, edgeDirection, walkBasis } from './EdgeWalkController';

describe('edgeDirection', () => {
  const W = 800;
  const H = 600;
  const M = 16;

  it('is idle away from the edges', () => {
    expect(edgeDirection(400, 300, W, H, M)).toEqual({ forward: 0, right: 0 });
  });

  it('maps each edge to a walk axis', () => {
    expect(edgeDirection(400, 5, W, H, M)).toEqual({ forward: 1, right: 0 });
    expect(edgeDirection(400, 595, W, H, M)).toEqual({ forward: -1, right: 0 });
    expect(edgeDirection(5, 300, W, H, M)).toEqual({ forward: 0, right: -1 });
    expect(edgeDirection(795, 300, W, H, M)).toEqual({ forward: 0, right: 1 });
  });

  it('combines both axes in a corner', () => {
    expect(edgeDirection(795, 5, W, H, M)).toEqual({ forward: 1, right: 1 });
  });
});

describe('walkBasis', () => {
  const forward = new Vector3();
  const right = new Vector3();

  it('walks along the ground toward the target', () => {
    walkBasis(
      new Vector3(0, 20, 50),
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0),
      forward,
      right
    );
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBe(0);
    expect(forward.z).toBeCloseTo(-1);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('uses screen-up as forward when looking straight down', () => {
    walkBasis(
      new Vector3(0, 20, 0),
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      forward,
      right
    );
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(1);
  });
});

describe('edgeCursor', () => {
  it('points the arrow the way the camera walks', () => {
    expect(edgeCursor({ forward: 1, right: 0 })).toBe('n-resize');
    expect(edgeCursor({ forward: 0, right: -1 })).toBe('w-resize');
    expect(edgeCursor({ forward: -1, right: 1 })).toBe('se-resize');
  });

  it('clears the cursor when idle', () => {
    expect(edgeCursor({ forward: 0, right: 0 })).toBe('');
  });
});
