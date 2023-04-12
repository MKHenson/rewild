import { init, wasm } from "./utils/wasm-module";

function matrixEquals4(a: any, b: any, tolerance?: number) {
  tolerance = tolerance || 0.0001;
  const aElements = wasm.getLiveF32Array(wasm.matrix4_elements(a));
  const bEelements = wasm.getLiveF32Array(wasm.matrix4_elements(b));
  if (aElements.length != bEelements.length) {
    return false;
  }

  for (var i = 0, il = aElements.length; i < il; i++) {
    var delta = aElements[i] - bEelements[i];
    if (delta > tolerance) {
      return false;
    }
  }

  return true;
}

describe("Matrix4", () => {
  beforeAll(async () => {
    await init();
  });

  it("multiplies another Matrix4", () => {
    const lhs = wasm.newMatrix4();
    const rhs = wasm.newMatrix4();

    wasm.matrix4_set(lhs, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);
    wasm.matrix4_set(rhs, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131);
    wasm.matrix4_multiply(lhs, rhs);
    const elements = wasm.getLiveF32Array(wasm.matrix4_elements(lhs));
    expect(elements[0]).toBe(1585);
    expect(elements[1]).toBe(5318);
    expect(elements[2]).toBe(10514);
    expect(elements[3]).toBe(15894);
    expect(elements[4]).toBe(1655);
    expect(elements[5]).toBe(5562);
    expect(elements[6]).toBe(11006);
    expect(elements[7]).toBe(16634);
    expect(elements[8]).toBe(1787);
    expect(elements[9]).toBe(5980);
    expect(elements[10]).toBe(11840);
    expect(elements[11]).toBe(17888);
    expect(elements[12]).toBe(1861);
    expect(elements[13]).toBe(6246);
    expect(elements[14]).toBe(12378);
    expect(elements[15]).toBe(18710);
  });

  it("multiplies another Matrix4 correctly with SIMD", () => {
    const lhs = wasm.newMatrix4();
    const rhs = wasm.newMatrix4();

    wasm.matrix4_set(lhs, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);
    wasm.matrix4_set(rhs, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131);
    wasm.matrix4_multiplySIMD(lhs, rhs);

    const elements = wasm.getLiveF32Array(wasm.matrix4_elements(lhs));
    expect(elements[0]).toBe(1585);
    expect(elements[1]).toBe(5318);
    expect(elements[2]).toBe(10514);
    expect(elements[3]).toBe(15894);
    expect(elements[4]).toBe(1655);
    expect(elements[5]).toBe(5562);
    expect(elements[6]).toBe(11006);
    expect(elements[7]).toBe(16634);
    expect(elements[8]).toBe(1787);
    expect(elements[9]).toBe(5980);
    expect(elements[10]).toBe(11840);
    expect(elements[11]).toBe(17888);
    expect(elements[12]).toBe(1861);
    expect(elements[13]).toBe(6246);
    expect(elements[14]).toBe(12378);
    expect(elements[15]).toBe(18710);
  });

  it("multiplies a scalar", () => {
    const b = wasm.newMatrix4();
    wasm.matrix4_set(b, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    const elements = wasm.getLiveF32Array(wasm.matrix4_elements(b));

    expect(elements[0]).toBe(0);
    expect(elements[1]).toBe(4);
    expect(elements[2]).toBe(8);
    expect(elements[3]).toBe(12);
    expect(elements[4]).toBe(1);
    expect(elements[5]).toBe(5);
    expect(elements[6]).toBe(9);
    expect(elements[7]).toBe(13);
    expect(elements[8]).toBe(2);
    expect(elements[9]).toBe(6);
    expect(elements[10]).toBe(10);
    expect(elements[11]).toBe(14);
    expect(elements[12]).toBe(3);
    expect(elements[13]).toBe(7);
    expect(elements[14]).toBe(11);
    expect(elements[15]).toBe(15);

    wasm.matrix4_multiplyScalar(b, 2);
    expect(elements[0]).toBe(0 * 2);
    expect(elements[1]).toBe(4 * 2);
    expect(elements[2]).toBe(8 * 2);
    expect(elements[3]).toBe(12 * 2);
    expect(elements[4]).toBe(1 * 2);
    expect(elements[5]).toBe(5 * 2);
    expect(elements[6]).toBe(9 * 2);
    expect(elements[7]).toBe(13 * 2);
    expect(elements[8]).toBe(2 * 2);
    expect(elements[9]).toBe(6 * 2);
    expect(elements[10]).toBe(10 * 2);
    expect(elements[11]).toBe(14 * 2);
    expect(elements[12]).toBe(3 * 2);
    expect(elements[13]).toBe(7 * 2);
    expect(elements[14]).toBe(11 * 2);
    expect(elements[15]).toBe(15 * 2);
  });

  it("multiplies a scalar with SIMD", () => {
    const b = wasm.newMatrix4();
    wasm.matrix4_set(b, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    const elements = wasm.getLiveF32Array(wasm.matrix4_elements(b));

    expect(elements[0]).toBe(0);
    expect(elements[1]).toBe(4);
    expect(elements[2]).toBe(8);
    expect(elements[3]).toBe(12);
    expect(elements[4]).toBe(1);
    expect(elements[5]).toBe(5);
    expect(elements[6]).toBe(9);
    expect(elements[7]).toBe(13);
    expect(elements[8]).toBe(2);
    expect(elements[9]).toBe(6);
    expect(elements[10]).toBe(10);
    expect(elements[11]).toBe(14);
    expect(elements[12]).toBe(3);
    expect(elements[13]).toBe(7);
    expect(elements[14]).toBe(11);
    expect(elements[15]).toBe(15);

    wasm.matrix4_multiplyScalarSIMD(b, 2);
    expect(elements[0]).toBe(0 * 2);
    expect(elements[1]).toBe(4 * 2);
    expect(elements[2]).toBe(8 * 2);
    expect(elements[3]).toBe(12 * 2);
    expect(elements[4]).toBe(1 * 2);
    expect(elements[5]).toBe(5 * 2);
    expect(elements[6]).toBe(9 * 2);
    expect(elements[7]).toBe(13 * 2);
    expect(elements[8]).toBe(2 * 2);
    expect(elements[9]).toBe(6 * 2);
    expect(elements[10]).toBe(10 * 2);
    expect(elements[11]).toBe(14 * 2);
    expect(elements[12]).toBe(3 * 2);
    expect(elements[13]).toBe(7 * 2);
    expect(elements[14]).toBe(11 * 2);
    expect(elements[15]).toBe(15 * 2);
  });

  it("scales correctly", () => {
    const a = wasm.newMatrix4();
    wasm.matrix4_set(a, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = wasm.newVector3(2, 3, 4);
    const c = wasm.newMatrix4();
    wasm.matrix4_set(c, 2, 6, 12, 4, 10, 18, 28, 8, 18, 30, 44, 12, 26, 42, 60, 16);

    wasm.matrix4_scale(a, b);
    expect(matrixEquals4(a, c)).toBe(true);
  });

  it("scales correctly with SIMD", () => {
    const a = wasm.newMatrix4();
    wasm.matrix4_set(a, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = wasm.newVector3(2, 3, 4);
    const c = wasm.newMatrix4();
    wasm.matrix4_set(c, 2, 6, 12, 4, 10, 18, 28, 8, 18, 30, 44, 12, 26, 42, 60, 16);

    wasm.matrix4_scaleSIMD(a, b);
    expect(matrixEquals4(a, c)).toBe(true);
  });

  it("transposes correctly", () => {
    let a = wasm.newMatrix4();
    let b = wasm.matrix4_transpose(wasm.matrix4_clone(a));
    expect(matrixEquals4(a, b)).toBe(true);

    b = wasm.matrix4_set(wasm.newMatrix4(), 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    const c = wasm.matrix4_transpose(wasm.matrix4_clone(b as any));
    expect(matrixEquals4(b, c)).toBe(false);

    wasm.matrix4_transpose(c as any);
    expect(matrixEquals4(b, c)).toBe(true);
  });

  it("transposes correctly with SIMD", () => {
    let a = wasm.newMatrix4();
    let b = wasm.matrix4_transposeSIMD(wasm.matrix4_clone(a));
    expect(matrixEquals4(a, b)).toBe(true);

    b = wasm.matrix4_set(wasm.newMatrix4(), 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15) as any;
    const c = wasm.matrix4_transposeSIMD(wasm.matrix4_clone(b));
    expect(matrixEquals4(b, c)).toBe(false);

    wasm.matrix4_transposeSIMD(c);
    expect(matrixEquals4(b, c)).toBe(true);
  });

  it("does invert a matrix", () => {
    const zero = wasm.matrix4_set(wasm.newMatrix4(), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const identity = wasm.newMatrix4();
    const a = wasm.newMatrix4();
    const b = wasm.matrix4_set(wasm.newMatrix4(), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    wasm.matrix4_invert(wasm.matrix4_copy(a, b as any));
    expect(matrixEquals4(a, zero)).toBe(true);

    const testMatrices = [
      wasm.matrix4_makeRotationX(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationX(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeRotationY(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationY(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeRotationZ(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationZ(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeScale(wasm.newMatrix4(), 1, 2, 3),
      wasm.matrix4_makeScale(wasm.newMatrix4(), 1 / 8, 1 / 2, 1 / 3),
      wasm.matrix4_makePerspective(wasm.newMatrix4(), -1, 1, 1, -1, 1, 1000),
      wasm.matrix4_makePerspective(wasm.newMatrix4(), -16, 16, 9, -9, 0.1, 10000),
      wasm.matrix4_makeTranslation(wasm.newMatrix4(), 1, 2, 3),
    ];

    for (let i = 0, il = testMatrices.length; i < il; i++) {
      let m = testMatrices[i];
      var mInverse = wasm.matrix4_invert(wasm.matrix4_copy(wasm.newMatrix4(), m as any));
      var mSelfInverse = wasm.matrix4_clone(m as any);
      wasm.matrix4_invert(mSelfInverse);

      // self-inverse should the same as inverse
      expect(matrixEquals4(mSelfInverse, mInverse)).toBe(true);

      // the determinant of the inverse should be the reciprocal
      expect(
        Math.abs(wasm.matrix4_determinant(m as any) * wasm.matrix4_determinant(mInverse as any) - 1) < 0.0001
      ).toBe(true);
      const mProduct = wasm.matrix4_multiplyMatrices(wasm.newMatrix4(), m as any, mInverse as any);
      // the determinant of the identity matrix is 1
      expect(Math.abs(wasm.matrix4_determinant(mProduct as any) - 1) < 0.0001).toBe(true);
      expect(matrixEquals4(mProduct, identity)).toBe(true);
    }
  });

  it("does invert a matrix with SIMD", () => {
    const zero = wasm.matrix4_set(wasm.newMatrix4(), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const identity = wasm.newMatrix4();
    const a = wasm.newMatrix4();
    const b = wasm.matrix4_set(wasm.newMatrix4(), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    wasm.matrix4_invertSIMD(wasm.matrix4_copy(a, b as any));
    expect(matrixEquals4(a, zero)).toBe(true);

    const testMatrices = [
      wasm.matrix4_makeRotationX(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationX(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeRotationY(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationY(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeRotationZ(wasm.newMatrix4(), 0.3),
      wasm.matrix4_makeRotationZ(wasm.newMatrix4(), -0.3),
      wasm.matrix4_makeScale(wasm.newMatrix4(), 1, 2, 3),
      wasm.matrix4_makeScale(wasm.newMatrix4(), 1 / 8, 1 / 2, 1 / 3),
      wasm.matrix4_makePerspective(wasm.newMatrix4(), -1, 1, 1, -1, 1, 1000),
      wasm.matrix4_makePerspective(wasm.newMatrix4(), -16, 16, 9, -9, 0.1, 10000),
      wasm.matrix4_makeTranslation(wasm.newMatrix4(), 1, 2, 3),
    ];

    for (let i = 0, il = testMatrices.length; i < il; i++) {
      let m = testMatrices[i];
      var mInverse = wasm.matrix4_invertSIMD(wasm.matrix4_copy(wasm.newMatrix4(), m as any));
      var mSelfInverse = wasm.matrix4_clone(m as any);
      wasm.matrix4_invertSIMD(wasm.matrix4_copy(mSelfInverse, mSelfInverse));

      // self-inverse should the same as inverse
      expect(matrixEquals4(mSelfInverse, mInverse)).toBe(true);

      // the determinant of the inverse should be the reciprocal
      let recip = Math.abs(wasm.matrix4_determinant(m as any) * wasm.matrix4_determinant(mInverse) - 1);
      expect(recip < 0.0001).toBe(true);

      const mProduct = wasm.matrix4_multiplyMatrices(wasm.newMatrix4(), m as any, mInverse);

      // the determinant of the identity matrix is 1
      recip = Math.abs(wasm.matrix4_determinant(mProduct as any) - 1);
      expect(recip < 0.0001).toBe(true);
      expect(matrixEquals4(mProduct, identity)).toBe(true);
    }
  });
});
