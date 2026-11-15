import { Quaternion } from './Quaternion';
import { Vector3 } from './Vector3';

const out = new Float32Array(3);

function turned(q: Float32Array, x: number, y: number, z: number) {
  Vector3.applyQuaternionFlat(out, 0, q, 0, x, y, z);
  return Array.from(out);
}

function expectVector(actual: number[], expected: number[]) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));
}

describe('Quaternion flat', () => {
  it('turns about an axis by the right hand', () => {
    const q = new Float32Array(4);
    Quaternion.setFromAxisAngleFlat(q, 0, 0, 1, 0, Math.PI / 2);
    expectVector(turned(q, 0, 0, 1), [1, 0, 0]);
  });

  it('multiplies so the right turn applies first, at offsets, in place', () => {
    const q = new Float32Array(8);
    Quaternion.setFromAxisAngleFlat(q, 4, 0, 1, 0, Math.PI / 2);
    const a = new Float32Array(4);
    Quaternion.setFromAxisAngleFlat(a, 0, 1, 0, 0, Math.PI / 2);
    Quaternion.multiplyQuaternionsFlat(q, 4, q, 4, a, 0);
    expectVector(turned(q.subarray(4), 0, 0, 1), [0, -1, 0]);
  });

  it('undoes a turn with its conjugate', () => {
    const q = new Float32Array(4);
    const inverse = new Float32Array(4);
    Quaternion.setFromAxisAngleFlat(q, 0, 0.6, 0, 0.8, 1.2);
    Quaternion.conjugateFlat(inverse, 0, q, 0);
    Quaternion.multiplyQuaternionsFlat(q, 0, inverse, 0, q, 0);
    expectVector(Array.from(q), [0, 0, 0, 1]);
  });

  it('finds the shortest turn between two directions', () => {
    const q = new Float32Array(4);
    Quaternion.setFromUnitVectorsFlat(q, 0, 2, 0, 0, 0, 3, 0);
    expectVector(turned(q, 1, 0, 0), [0, 1, 0]);
    expectVector(turned(q, 0, 0, 1), [0, 0, 1]);
  });

  it('turns half round for opposite directions', () => {
    const q = new Float32Array(4);
    Quaternion.setFromUnitVectorsFlat(q, 0, 0, 1, 0, 0, -1, 0);
    expectVector(turned(q, 0, 1, 0), [0, -1, 0]);
    Quaternion.setFromUnitVectorsFlat(q, 0, 1, 0, 0, -1, 0, 0);
    expectVector(turned(q, 1, 0, 0), [-1, 0, 0]);
  });

  it('leaves a zero direction unturned', () => {
    const q = new Float32Array(4);
    Quaternion.setFromUnitVectorsFlat(q, 0, 0, 0, 0, 1, 0, 0);
    expectVector(Array.from(q), [0, 0, 0, 1]);
  });

  it('normalizes in place and turns zero into identity', () => {
    const q = new Float32Array([0, 0, 0, 0, 0, 0, 3, 4]);
    Quaternion.normalizeFlat(q, 4);
    expectVector(Array.from(q.subarray(4)), [0, 0, 0.6, 0.8]);
    Quaternion.normalizeFlat(q, 0);
    expectVector(Array.from(q.subarray(0, 4)), [0, 0, 0, 1]);
  });
});
