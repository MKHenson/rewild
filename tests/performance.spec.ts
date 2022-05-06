import expect = require("expect.js");
import { SimpleMatrix4 } from "./utils/math/SimpleMatrix4";
import { wasm } from "./wasm-module";

const numTests = 20000;

describe("Performance Tests", () => {
  it("is faster in wasm when multiplying a matrix4", () => {
    const testMatrixMultiplication = (numMatrices: number = 100): void => {
      const source = new SimpleMatrix4();
      const matrices: SimpleMatrix4[] = new Array();
      for (let i = 0; i < numTests; i++) {
        matrices.push(new SimpleMatrix4());
      }

      for (let i = 0; i < matrices.length; i++) {
        matrices[i].multiplyMatrices(matrices[i], source);
      }

      for (let i = 0; i < matrices.length; i++) {
        matrices[i].multiplyMatrices(matrices[i], source);
      }
    };

    const t1 = performance.now();
    wasm.PerformanceTests.matrixMultiplication(numTests);
    const asDeltaMS = performance.now() - t1;

    const t2 = performance.now();
    testMatrixMultiplication(numTests);
    const tsDeltaMS = performance.now() - t2;

    expect(asDeltaMS).to.be.lessThan(tsDeltaMS);
  });
});
