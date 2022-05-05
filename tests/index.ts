import { SimpleMatrix4 } from "../src/ts/renderer/SimpleMatrix4";
import { wasm } from "./wasm-module";

const numTests = 20000;

describe("Check the performance difference between matrix multiplications", () => {
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

    console.time("As Test #1");
    const value = wasm.testMatrixMultiplication(numTests);
    console.timeEnd("As Test #1");
    console.log(`The value is ${value}`);

    console.time("TS Test #2");
    testMatrixMultiplication(numTests);
    console.timeEnd("TS Test #2");
  });
});
