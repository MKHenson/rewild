import { wasm } from "./wasm-module";
import expect from "expect.js";

function matrixEquals4(a: Float32Array, b: Float32Array, tolerance?: number) {
  tolerance = tolerance || 0.0001;
  const aElements = a;
  const bEelements = b;
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
  it("multiplies another Matrix4", () => {
    const lhs = wasm.newMatrix4();
    const rhs = wasm.newMatrix4();

    wasm.matrix_set(lhs, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);
    wasm.matrix_set(rhs, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131);
    wasm.matrix_multiply(lhs, rhs);
    const elements = wasm.getLiveF32Array(wasm.matrix_elements(lhs));
    expect(elements[0]).to.equal(1585);
    expect(elements[1]).to.equal(5318);
    expect(elements[2]).to.equal(10514);
    expect(elements[3]).to.equal(15894);
    expect(elements[4]).to.equal(1655);
    expect(elements[5]).to.equal(5562);
    expect(elements[6]).to.equal(11006);
    expect(elements[7]).to.equal(16634);
    expect(elements[8]).to.equal(1787);
    expect(elements[9]).to.equal(5980);
    expect(elements[10]).to.equal(11840);
    expect(elements[11]).to.equal(17888);
    expect(elements[12]).to.equal(1861);
    expect(elements[13]).to.equal(6246);
    expect(elements[14]).to.equal(12378);
    expect(elements[15]).to.equal(18710);
  });

  it("multiplies another Matrix4 correctly with SIMD", () => {
    const lhs = wasm.newMatrix4();
    const rhs = wasm.newMatrix4();

    wasm.matrix_set(lhs, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);
    wasm.matrix_set(rhs, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131);
    wasm.matrix_multiplySIMD(lhs, rhs);

    const elements = wasm.getLiveF32Array(wasm.matrix_elements(lhs));
    expect(elements[0]).to.equal(1585);
    expect(elements[1]).to.equal(5318);
    expect(elements[2]).to.equal(10514);
    expect(elements[3]).to.equal(15894);
    expect(elements[4]).to.equal(1655);
    expect(elements[5]).to.equal(5562);
    expect(elements[6]).to.equal(11006);
    expect(elements[7]).to.equal(16634);
    expect(elements[8]).to.equal(1787);
    expect(elements[9]).to.equal(5980);
    expect(elements[10]).to.equal(11840);
    expect(elements[11]).to.equal(17888);
    expect(elements[12]).to.equal(1861);
    expect(elements[13]).to.equal(6246);
    expect(elements[14]).to.equal(12378);
    expect(elements[15]).to.equal(18710);
  });

  it("multiplies a scalar", () => {
    const b = wasm.newMatrix4();
    wasm.matrix_set(b, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    const elements = wasm.getLiveF32Array(wasm.matrix_elements(b));

    expect(elements[0]).to.be.equal(0);
    expect(elements[1]).to.be.equal(4);
    expect(elements[2]).to.be.equal(8);
    expect(elements[3]).to.be.equal(12);
    expect(elements[4]).to.be.equal(1);
    expect(elements[5]).to.be.equal(5);
    expect(elements[6]).to.be.equal(9);
    expect(elements[7]).to.be.equal(13);
    expect(elements[8]).to.be.equal(2);
    expect(elements[9]).to.be.equal(6);
    expect(elements[10]).to.be.equal(10);
    expect(elements[11]).to.be.equal(14);
    expect(elements[12]).to.be.equal(3);
    expect(elements[13]).to.be.equal(7);
    expect(elements[14]).to.be.equal(11);
    expect(elements[15]).to.be.equal(15);

    wasm.matrix_multiplyScalar(b, 2);
    expect(elements[0]).to.be.equal(0 * 2);
    expect(elements[1]).to.be.equal(4 * 2);
    expect(elements[2]).to.be.equal(8 * 2);
    expect(elements[3]).to.be.equal(12 * 2);
    expect(elements[4]).to.be.equal(1 * 2);
    expect(elements[5]).to.be.equal(5 * 2);
    expect(elements[6]).to.be.equal(9 * 2);
    expect(elements[7]).to.be.equal(13 * 2);
    expect(elements[8]).to.be.equal(2 * 2);
    expect(elements[9]).to.be.equal(6 * 2);
    expect(elements[10]).to.be.equal(10 * 2);
    expect(elements[11]).to.be.equal(14 * 2);
    expect(elements[12]).to.be.equal(3 * 2);
    expect(elements[13]).to.be.equal(7 * 2);
    expect(elements[14]).to.be.equal(11 * 2);
    expect(elements[15]).to.be.equal(15 * 2);
  });

  it("multiplies a scalar with SIMD", () => {
    const b = wasm.newMatrix4();
    wasm.matrix_set(b, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    const elements = wasm.getLiveF32Array(wasm.matrix_elements(b));

    expect(elements[0]).to.be.equal(0);
    expect(elements[1]).to.be.equal(4);
    expect(elements[2]).to.be.equal(8);
    expect(elements[3]).to.be.equal(12);
    expect(elements[4]).to.be.equal(1);
    expect(elements[5]).to.be.equal(5);
    expect(elements[6]).to.be.equal(9);
    expect(elements[7]).to.be.equal(13);
    expect(elements[8]).to.be.equal(2);
    expect(elements[9]).to.be.equal(6);
    expect(elements[10]).to.be.equal(10);
    expect(elements[11]).to.be.equal(14);
    expect(elements[12]).to.be.equal(3);
    expect(elements[13]).to.be.equal(7);
    expect(elements[14]).to.be.equal(11);
    expect(elements[15]).to.be.equal(15);

    wasm.matrix_multiplyScalarSIMD(b, 2);
    expect(elements[0]).to.be.equal(0 * 2);
    expect(elements[1]).to.be.equal(4 * 2);
    expect(elements[2]).to.be.equal(8 * 2);
    expect(elements[3]).to.be.equal(12 * 2);
    expect(elements[4]).to.be.equal(1 * 2);
    expect(elements[5]).to.be.equal(5 * 2);
    expect(elements[6]).to.be.equal(9 * 2);
    expect(elements[7]).to.be.equal(13 * 2);
    expect(elements[8]).to.be.equal(2 * 2);
    expect(elements[9]).to.be.equal(6 * 2);
    expect(elements[10]).to.be.equal(10 * 2);
    expect(elements[11]).to.be.equal(14 * 2);
    expect(elements[12]).to.be.equal(3 * 2);
    expect(elements[13]).to.be.equal(7 * 2);
    expect(elements[14]).to.be.equal(11 * 2);
    expect(elements[15]).to.be.equal(15 * 2);
  });

  it("scales correctly", () => {
    const a = wasm.newMatrix4();
    wasm.matrix_set(a, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = wasm.newVector3(2, 3, 4);
    const c = wasm.newMatrix4();
    wasm.matrix_set(c, 2, 6, 12, 4, 10, 18, 28, 8, 18, 30, 44, 12, 26, 42, 60, 16);

    wasm.matrix_scale(a, b);
    expect(
      matrixEquals4(wasm.getLiveF32Array(wasm.matrix_elements(a)), wasm.getLiveF32Array(wasm.matrix_elements(c)))
    ).to.be.equal(true);
  });

  it("scales correctly with SIMD", () => {
    const a = wasm.newMatrix4();
    wasm.matrix_set(a, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const b = wasm.newVector3(2, 3, 4);
    const c = wasm.newMatrix4();
    wasm.matrix_set(c, 2, 6, 12, 4, 10, 18, 28, 8, 18, 30, 44, 12, 26, 42, 60, 16);

    wasm.matrix_scaleSIMD(a, b);
    expect(
      matrixEquals4(wasm.getLiveF32Array(wasm.matrix_elements(a)), wasm.getLiveF32Array(wasm.matrix_elements(c)))
    ).to.be.equal(true);
  });
});
