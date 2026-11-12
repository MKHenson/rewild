import { aboutAxis, between, conjugate, multiply, rotate } from './poseMath';

const out = new Float32Array(3);

function turned(q: Float32Array, x: number, y: number, z: number) {
  rotate(out, 0, q, 0, x, y, z);
  return Array.from(out);
}

function expectVector(actual: number[], expected: number[]) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));
}

describe('poseMath', () => {
  it('turns about an axis by the right hand', () => {
    const q = new Float32Array(4);
    aboutAxis(q, 0, 1, 0, Math.PI / 2);
    expectVector(turned(q, 0, 0, 1), [1, 0, 0]);
  });

  it('multiplies so the right turn applies first, at offsets, in place', () => {
    const q = new Float32Array(8);
    const a = new Float32Array(4);
    aboutAxis(a, 0, 1, 0, Math.PI / 2);
    q.set(a, 4);
    aboutAxis(a, 1, 0, 0, Math.PI / 2);
    multiply(q, 4, q, 4, a, 0);
    expectVector(turned(q.subarray(4), 0, 0, 1), [0, -1, 0]);
  });

  it('undoes a turn with its conjugate', () => {
    const q = new Float32Array(4);
    const inverse = new Float32Array(4);
    aboutAxis(q, 0.6, 0, 0.8, 1.2);
    conjugate(inverse, 0, q, 0);
    multiply(q, 0, inverse, 0, q, 0);
    expectVector(Array.from(q), [0, 0, 0, 1]);
  });

  it('finds the shortest turn between two directions', () => {
    const q = new Float32Array(4);
    between(q, 2, 0, 0, 0, 3, 0);
    expectVector(turned(q, 1, 0, 0), [0, 1, 0]);
    expectVector(turned(q, 0, 0, 1), [0, 0, 1]);
  });

  it('turns half round for opposite directions', () => {
    const q = new Float32Array(4);
    between(q, 0, 1, 0, 0, -1, 0);
    expectVector(turned(q, 0, 1, 0), [0, -1, 0]);
    between(q, 1, 0, 0, -1, 0, 0);
    expectVector(turned(q, 1, 0, 0), [-1, 0, 0]);
  });

  it('leaves a zero direction unturned', () => {
    const q = new Float32Array(4);
    between(q, 0, 0, 0, 1, 0, 0);
    expectVector(Array.from(q), [0, 0, 0, 1]);
  });
});
