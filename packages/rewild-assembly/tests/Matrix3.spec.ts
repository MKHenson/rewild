import { init, wasm } from "./utils/wasm-module";

function matrixEquals3(a: any, b: any, tolerance?: number) {
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

describe("Matrix3", () => {
  beforeAll(async () => {
    await init();
  });

  it("identity", () => {
    var b = wasm.matrix3_set(wasm.newMatrix3(), 0, 1, 2, 3, 4, 5, 6, 7, 8);
    const elements = wasm.getLiveF32Array(wasm.matrix3_elements(b));

    expect(elements[0]).toBe(0);
    expect(elements[1]).toBe(3);
    expect(elements[2]).toBe(6);
    expect(elements[4]).toBe(1);
    expect(elements[5]).toBe(4);
    expect(elements[6]).toBe(7);
    expect(elements[8]).toBe(2);
    expect(elements[9]).toBe(5);
    expect(elements[10]).toBe(8);

    var a = wasm.newMatrix3();
    expect(matrixEquals3(a, b)).toBe(false);

    wasm.matrix3_identity(b);
    expect(matrixEquals3(a, b)).toBe(true);
  });

  it("multiplies another Matrix3", () => {
    const lhs = wasm.matrix3_set(wasm.newMatrix3(), 2, 3, 5, 7, 11, 13, 17, 19, 23);
    const rhs = wasm.matrix3_set(wasm.newMatrix3(), 29, 31, 37, 41, 43, 47, 53, 59, 61);
    const ans = wasm.newMatrix3();

    wasm.matrix3_multiplyMatrices(ans, lhs, rhs);

    const elements = wasm.getLiveF32Array(wasm.matrix3_elements(ans));
    expect(elements[0]).toBe(446);
    expect(elements[1]).toBe(1343);
    expect(elements[2]).toBe(2491);
    expect(elements[4]).toBe(486);
    expect(elements[5]).toBe(1457);
    expect(elements[6]).toBe(2701);
    expect(elements[8]).toBe(520);
    expect(elements[9]).toBe(1569);
    expect(elements[10]).toBe(2925);
  });

  it("clone", () => {
    const a = wasm.matrix3_set(wasm.newMatrix3(), 0, 1, 2, 3, 4, 5, 6, 7, 8);
    const b = wasm.matrix3_clone(a);

    expect(matrixEquals3(a, b)).toBe(true);

    const elements = wasm.getLiveF32Array(wasm.matrix3_elements(a));

    // ensure that it is a true copy
    elements[0] = 2;
    expect(matrixEquals3(a, b)).toBe(false);
  });

  it("multiplyScalar", () => {
    var b = wasm.matrix3_set(wasm.newMatrix3(), 0, 1, 2, 3, 4, 5, 6, 7, 8);
    const elements = wasm.getLiveF32Array(wasm.matrix3_elements(b));

    expect(elements[0]).toBe(0);
    expect(elements[1]).toBe(3);
    expect(elements[2]).toBe(6);
    expect(elements[4]).toBe(1);
    expect(elements[5]).toBe(4);
    expect(elements[6]).toBe(7);
    expect(elements[8]).toBe(2);
    expect(elements[9]).toBe(5);
    expect(elements[10]).toBe(8);

    wasm.matrix3_multiplyScalar(b, 2);
    expect(elements[0]).toBe(0 * 2);
    expect(elements[1]).toBe(3 * 2);
    expect(elements[2]).toBe(6 * 2);
    expect(elements[4]).toBe(1 * 2);
    expect(elements[5]).toBe(4 * 2);
    expect(elements[6]).toBe(7 * 2);
    expect(elements[8]).toBe(2 * 2);
    expect(elements[9]).toBe(5 * 2);
    expect(elements[10]).toBe(8 * 2);
  });
});
