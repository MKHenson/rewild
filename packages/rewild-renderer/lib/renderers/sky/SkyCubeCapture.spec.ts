import { CUBE_FACE_COUNT, SkyCaptureScheduler } from './SkyCaptureScheduler';
import {
  SKY_CUBE_FACE_MATRICES,
  SKY_CUBE_SIZE,
  starCaptureLod,
} from './SkyCubeCapture';

/**
 * What the sky vertex shader does with the matrix: reconstruct a ray direction
 * from a clip-space corner. Column-major, w forced to 1 by construction, so the
 * perspective divide is written out here to prove it really is a no-op.
 */
function rayForFace(face: number, ndcX: number, ndcY: number) {
  const m = SKY_CUBE_FACE_MATRICES[face];
  const ndc = [ndcX, ndcY, 1, 1];
  const out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let col = 0; col < 4; col++) sum += m[col * 4 + row] * ndc[col];
    out[row] = sum;
  }
  const w = out[3];
  const len = Math.hypot(out[0] / w, out[1] / w, out[2] / w);
  return {
    w,
    dir: [out[0] / w / len, out[1] / w / len, out[2] / w / len],
  };
}

const [POS_X, NEG_X, POS_Y, NEG_Y, POS_Z, NEG_Z] = [0, 1, 2, 3, 4, 5];

describe('sky cube face matrices', () => {
  it('has one matrix per face', () => {
    expect(SKY_CUBE_FACE_MATRICES).toHaveLength(CUBE_FACE_COUNT);
  });

  // If this drifts the shader starts doing a divide it was never meant to do,
  // and the far-plane reconstruction stops being exact.
  it('leaves w at exactly 1 across the whole face', () => {
    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      for (const [x, y] of [
        [0, 0],
        [-1, -1],
        [1, 1],
        [-1, 1],
        [0.37, -0.62],
      ]) {
        expect(rayForFace(face, x, y).w).toBe(1);
      }
    }
  });

  it('points each face centre down its own axis', () => {
    const axes = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      const { dir } = rayForFace(face, 0, 0);
      expect(dir[0]).toBeCloseTo(axes[face][0], 6);
      expect(dir[1]).toBeCloseTo(axes[face][1], 6);
      expect(dir[2]).toBeCloseTo(axes[face][2], 6);
    }
  });

  it('spans a 90 degree frustum, so the six faces tile the sphere exactly', () => {
    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      const centre = rayForFace(face, 0, 0).dir;
      // A corner of a 90° face sits at acos(1/sqrt(3)) ≈ 54.7356° from centre.
      const corner = rayForFace(face, 1, 1).dir;
      const cos =
        centre[0] * corner[0] + centre[1] * corner[1] + centre[2] * corner[2];
      expect(cos).toBeCloseTo(1 / Math.sqrt(3), 6);
    }
  });

  /**
   * The real test. A mirrored or rotated face still passes every check above —
   * its centre is right and its extent is right — but it will not line up with
   * its neighbours. Walking each shared edge from both sides catches exactly the
   * class of bug that a lookAt-derived face matrix introduces, and that nothing
   * in a smooth sky gradient would ever make visible.
   *
   * Each entry names two faces and, for a parameter t running -1..1, where that
   * point lies in each face's NDC.
   */
  it('agrees with its neighbours along every shared edge', () => {
    const seams: [
      number,
      (t: number) => [number, number],
      number,
      (t: number) => [number, number]
    ][] = [
      // +X's left edge meets +Z's right edge.
      [POS_X, (t) => [-1, t], POS_Z, (t) => [1, t]],
      // +X's right edge meets -Z's left edge.
      [POS_X, (t) => [1, t], NEG_Z, (t) => [-1, t]],
      // -X's left edge meets -Z's right edge.
      [NEG_X, (t) => [-1, t], NEG_Z, (t) => [1, t]],
      // -X's right edge meets +Z's left edge.
      [NEG_X, (t) => [1, t], POS_Z, (t) => [-1, t]],
      // +Y's bottom edge meets +Z's top edge.
      [POS_Y, (t) => [t, -1], POS_Z, (t) => [t, 1]],
      // -Y's top edge meets +Z's bottom edge.
      [NEG_Y, (t) => [t, 1], POS_Z, (t) => [t, -1]],
      // +Y's right edge meets +X's top edge.
      [POS_Y, (t) => [1, t], POS_X, (t) => [t, 1]],
      // -Y's right edge meets +X's bottom edge.
      [NEG_Y, (t) => [1, t], POS_X, (t) => [-t, -1]],
      // +Y's left edge meets -X's top edge.
      [POS_Y, (t) => [-1, t], NEG_X, (t) => [-t, 1]],
      // -Y's left edge meets -X's bottom edge.
      [NEG_Y, (t) => [-1, t], NEG_X, (t) => [t, -1]],
      // +Y's top edge meets -Z's top edge.
      [POS_Y, (t) => [t, 1], NEG_Z, (t) => [-t, 1]],
      // -Y's bottom edge meets -Z's bottom edge.
      [NEG_Y, (t) => [t, -1], NEG_Z, (t) => [-t, -1]],
    ];

    for (const [faceA, atA, faceB, atB] of seams) {
      for (const t of [-1, -0.5, 0, 0.25, 1]) {
        const [ax, ay] = atA(t);
        const [bx, by] = atB(t);
        const a = rayForFace(faceA, ax, ay).dir;
        const b = rayForFace(faceB, bx, by).dir;
        for (let i = 0; i < 3; i++) {
          expect(a[i]).toBeCloseTo(b[i], 6);
        }
      }
    }
  });
});

describe('starCaptureLod', () => {
  // The shipping pair: a 1024 star cube resampled onto 128-a-side faces.
  it('picks the level whose texels match a captured face', () => {
    expect(starCaptureLod(1024, 11)).toBe(3);
  });

  // The whole point of the level. Reading 0 here is the bug it exists to stop:
  // one bilinear tap standing in for 64 source texels.
  it('never resolves to mip 0 while the star cube is finer than a face', () => {
    expect(starCaptureLod(SKY_CUBE_SIZE * 2, 11)).toBeGreaterThan(0);
  });

  // A level past the end of the chain is not an error in WebGPU — it clamps to
  // the last one — so an under-mipped source would over-blur silently.
  it('clamps to the levels the source actually has', () => {
    expect(starCaptureLod(1024, 1)).toBe(0);
    expect(starCaptureLod(1024, 3)).toBe(2);
  });

  // A star cube at or below face resolution needs no reduction, and a negative
  // level is not a level.
  it('never goes below zero when the source is no finer than a face', () => {
    expect(starCaptureLod(SKY_CUBE_SIZE, 11)).toBe(0);
    expect(starCaptureLod(SKY_CUBE_SIZE / 4, 11)).toBe(0);
  });
});

describe('SkyCaptureScheduler', () => {
  // A static sky is the editor's normal state, so it has to settle to zero
  // work rather than idling at one face a frame forever.
  const still = (s: SkyCaptureScheduler) => s.plan(0, 1, 0, 0.5, 0.3, 0.5, 20);

  it('draws the whole cube on the first frame', () => {
    const scheduler = new SkyCaptureScheduler();
    expect(still(scheduler)).toBe(CUBE_FACE_COUNT);
  });

  it('stops entirely once the cube is current and nothing moves', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    for (let frame = 0; frame < 10; frame++) expect(still(scheduler)).toBe(0);
    expect(scheduler.facesPending).toBe(0);
  });

  it('spreads a drifting sun one face per frame', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);

    // ~0.03° of travel per frame, the day/night cycle's actual rate.
    let sunY = 1;
    for (let frame = 0; frame < 20; frame++) {
      sunY -= 0.0006;
      expect(scheduler.plan(0, sunY, 0, 0.5, 0.3, 0.5, 20)).toBe(1);
    }
  });

  it('walks the faces round-robin so none is starved', () => {
    const scheduler = new SkyCaptureScheduler();
    const seen: number[] = [];
    for (let i = 0; i < CUBE_FACE_COUNT * 2; i++)
      seen.push(scheduler.nextFace());
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
  });

  it('finishes an interrupted cycle even after the sky settles', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    // One small nudge, then stillness: the cycle it started must still complete.
    scheduler.plan(0, 0.999, 0, 0.5, 0.3, 0.5, 20);
    let drawn = 1;
    for (let frame = 0; frame < 10; frame++) {
      drawn += scheduler.plan(0, 0.999, 0, 0.5, 0.3, 0.5, 20);
    }
    expect(drawn).toBe(CUBE_FACE_COUNT);
  });

  // A slider drag or a console setter moves the sky further in one frame than
  // it would in a hundred. Spreading that across six frames would capture two
  // different skies into one cube.
  it.each([
    ['sun', () => [0, 0.2, 0.98, 0.5, 0.3, 0.5, 20]],
    ['cloudiness', () => [0, 1, 0, 0.95, 0.3, 0.5, 20]],
    ['foginess', () => [0, 1, 0, 0.5, 0.9, 0.5, 20]],
    ['temperature', () => [0, 1, 0, 0.5, 0.3, 0.95, 20]],
    ['altitude', () => [0, 1, 0, 0.5, 0.3, 0.5, 4000]],
  ])('redraws all six faces at once when %s jumps', (_label, jumped) => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    still(scheduler);

    const [sx, sy, sz, cloud, fog, temp, alt] = jumped();
    expect(scheduler.plan(sx, sy, sz, cloud, fog, temp, alt)).toBe(
      CUBE_FACE_COUNT
    );
  });

  it('ignores a change too small to alter the capture', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    // Under every epsilon: sub-micro-radian sun, and half a metre of camera lift.
    expect(scheduler.plan(0, 1 - 1e-6, 0, 0.5, 0.3, 0.5, 20.4)).toBe(0);
  });

  // The reason staleness is measured against the last capture rather than the
  // last frame. A glider descending at 3 m/s moves 0.05m a frame, under any
  // workable per-frame epsilon — against a per-frame baseline it would lose
  // hundreds of metres of altitude with the cubemap never once redrawn.
  it('accumulates drift too slow to clear the epsilon in one frame', () => {
    const scheduler = new SkyCaptureScheduler();
    let altitude = 400;
    still(scheduler);
    scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, altitude);

    let drawn = 0;
    for (let frame = 0; frame < 60; frame++) {
      altitude -= 0.05;
      drawn += scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, altitude);
    }

    // 3m of descent over a second must not pass unnoticed.
    expect(drawn).toBeGreaterThan(0);
  });

  it('accumulates a sun drifting below the per-frame epsilon', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);

    let sunY = 1;
    let drawn = 0;
    for (let frame = 0; frame < 60; frame++) {
      // A tenth of SUN_EPSILON per frame — a slowed-down day/night cycle.
      sunY -= 1e-5;
      drawn += scheduler.plan(0, sunY, 0, 0.5, 0.3, 0.5, 20);
    }
    expect(drawn).toBeGreaterThan(0);
  });

  // 200m was four to thirteen fog scale heights — a teleport that changed the
  // fog term by orders of magnitude would have been spread over six frames.
  it('treats a short camera teleport as a jump', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    still(scheduler);
    expect(scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, 80)).toBe(CUBE_FACE_COUNT);
  });

  // ...but ordinary motion must stay on the amortised path. Terminal velocity
  // is ~0.9m per frame; even a fast flyer is nowhere near ALTITUDE_JUMP.
  it('leaves fast continuous descent amortised', () => {
    const scheduler = new SkyCaptureScheduler();
    let altitude = 3000;
    // Settle at altitude first — arriving there is itself a teleport.
    scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, altitude);
    scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, altitude);

    for (let frame = 0; frame < 20; frame++) {
      altitude -= 5;
      expect(scheduler.plan(0, 1, 0, 0.5, 0.3, 0.5, altitude)).toBe(1);
    }
  });

  it('redraws everything when refresh is forced immediately', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    still(scheduler);
    scheduler.refresh(true);
    expect(still(scheduler)).toBe(CUBE_FACE_COUNT);
  });

  it('spreads a forced refresh when it is not marked immediate', () => {
    const scheduler = new SkyCaptureScheduler();
    still(scheduler);
    still(scheduler);
    scheduler.refresh();
    expect(still(scheduler)).toBe(1);
  });
});
