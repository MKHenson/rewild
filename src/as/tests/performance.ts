import { Matrix4 } from "../math/Matrix4";
import { Vector3 } from "../math/Vector3";

const _matrices: Matrix4[] = new Array();

function allocatePerfTest(numMatrices: i32): void {
  for (let i = 0; i < numMatrices; i++) {
    _matrices.push(new Matrix4().set(1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0));
  }
}

function deallocatePerfTest(): void {
  _matrices.splice(0, _matrices.length);
}

function testPerformanceMat4Multiply(numMatrices: i32, useSimd: boolean = false): void {
  const source = new Matrix4();
  const matrices = _matrices;
  let m: Matrix4;
  if (useSimd) {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.multiplyMatricesSIMD(m, source);
    }
  } else {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.multiplyMatrices(m, source);
    }
  }
}

function testPerformanceMat4Scale(numMatrices: i32, useSimd: boolean = false): void {
  const matrices = _matrices;
  let m: Matrix4;
  if (useSimd) {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.scaleSIMD(scaleVec);
    }
  } else {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.scale(scaleVec);
    }
  }
}

function testPerformanceMat4Inverse(numMatrices: i32, useSimd: boolean = false): void {
  const matrices = _matrices;
  let m: Matrix4;
  if (useSimd) {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.invertSIMD();
    }
  } else {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.invert();
    }
  }
}

function testPerformanceMat4MultiplyScalar(numMatrices: i32, useSimd: boolean = false): void {
  const matrices = _matrices;
  let m: Matrix4;
  if (useSimd) {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.multiplyScalarSIMD(5);
    }
  } else {
    for (let i = 0; i < numMatrices; i++) {
      m = unchecked(matrices[i]);
      m.multiplyScalar(5);
    }
  }
}

const scaleVec: Vector3 = new Vector3(1.5, 3.4, 5.5);

export {
  allocatePerfTest,
  deallocatePerfTest,
  testPerformanceMat4Multiply,
  testPerformanceMat4Inverse,
  testPerformanceMat4Scale,
  testPerformanceMat4MultiplyScalar,
};
