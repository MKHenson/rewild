import { SimpleMatrix4 } from "../src/ts/renderer/SimpleMatrix4";
import { wasm } from "./wasm-module";

describe("Check the performance difference between matrix multiplications", () => {
  it("is faster in wasm when multiplying a matrix4", () => {
    const testMatrixMultiplication = (numMatrices: number = 100): void => {
      const source = new SimpleMatrix4();
      const matrices: SimpleMatrix4[] = new Array();
      for (let i = 0; i < numMatrices; i++) {
        matrices.push(new SimpleMatrix4());
      }

      for (let i = 0; i < matrices.length; i++) {
        matrices[i].multiplyMatrices(matrices[i], source);
      }
    };

    console.time("Function #1");
    const value = wasm.testMatrixMultiplication(10000);
    console.timeEnd("Function #1");
    console.log(`The value is ${value}`);

    console.time("Function #2");
    testMatrixMultiplication(10000);
    console.timeEnd("Function #2");
  });
});
