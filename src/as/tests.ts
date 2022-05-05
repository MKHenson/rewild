import { Matrix4 } from "./math/Matrix4";

export namespace PerformanceTests {
  export function matrixMultiplication(numMatrices: i32 = 100): f32 {
    const source = new Matrix4();
    const matrices: Matrix4[] = new Array();

    for (let i = 0; i < numMatrices; i++) {
      matrices.push(new Matrix4());
    }

    for (let i = 0; i < matrices.length; i++) {
      unchecked(matrices[i]).multiplyMatrices(unchecked(matrices[i]), source);
    }

    for (let i = 0; i < matrices.length; i++) {
      unchecked(matrices[i]).multiplyMatrices(unchecked(matrices[i]), source);
    }

    return 0;
  }
}
