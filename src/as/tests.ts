import { Matrix4 } from "./math/Matrix4";
import { Vector3 } from "./math/Vector3";

const _matrices: Matrix4[] = new Array();

// // asc --runtime incremental
// @unmanaged  // means it will not managed by GC
// class Foo {
//   constructor(public n: i32) {}
// }
// const foo = new Foo(1);
// heap.free(changetype<usize>(foo));  // dealloc

function allocatePerfTest(numMatrices: i32): void {
  for (let i = 0; i < numMatrices; i++) {
    _matrices.push(new Matrix4());
  }

  // const matrices: Matrix4[] = [];
  // for (let i = 0; i < numMatrices; i++) {
  //   matrices.push(new Matrix4());
  // }

  // for (let i = 0; i < matrices.length; i++) {
  //   _matrices[i].dispose();
  // }
}

function deallocatePerfTest(): void {
  // const numMatrices = _matrices.length;
  // for (let i = 0; i < numMatrices; i++) {
  //   heap.free(changetype<usize>(unchecked(_matrices[i])));
  // }
  _matrices.splice(0, _matrices.length);
}

function testASMultiplicationPerformance(numMatrices: i32): void {
  const source = new Matrix4();
  const matrices = _matrices;
  let m: Matrix4;
  for (let i = 0; i < numMatrices; i++) {
    m = unchecked(matrices[i]);
    m.multiplyMatrices(m, source);
  }
}

function testASMultiplicationPerformanceWithSIMD(numMatrices: i32): void {
  const source = new Matrix4();
  const matrices = _matrices;
  let m: Matrix4;
  for (let i = 0; i < numMatrices; i++) {
    m = unchecked(matrices[i]);
    m.multiplyMatricesSIMD(m, source);
  }
}

const scaleVec: Vector3 = new Vector3(1.5, 3.4, 5.5);

function testMat4Performance(numMatrices: i32): void {
  const source = new Matrix4();
  const matrices = _matrices;
  let m: Matrix4;
  for (let i = 0; i < numMatrices; i++) {
    m = unchecked(matrices[i]);
    m.multiplyMatrices(m, source);
    m.multiplyScalar(5);
    m.scale(scaleVec);
  }
}

function testMat4SIMDPerformance(numMatrices: i32): void {
  const source = new Matrix4();
  const matrices = _matrices;
  let m: Matrix4;
  for (let i = 0; i < numMatrices; i++) {
    m = unchecked(matrices[i]);
    m.multiplyMatricesSIMD(m, source);
    m.multiplyScalarSIMD(5);
    m.scaleSIMD(scaleVec);
  }
}

// prettier-ignore
function newMatrix4(): Matrix4 { return new Matrix4(); }
// prettier-ignore
function newVector3(x: f32 = 0, y: f32 = 0, z: f32 = 0): Vector3 { return new Vector3(x, y, z); }
// prettier-ignore
function matrix_elements(matrix: Matrix4): usize { return changetype<usize>( matrix.elements); }
// prettier-ignore
function matrix_multiply(matrixA: Matrix4, matrixB: Matrix4): void { matrixA.multiply(matrixB); }
// prettier-ignore
function matrix_multiplySIMD(matrixA: Matrix4, matrixB: Matrix4): void { matrixA.multiplySIMD(matrixB); }
// prettier-ignore
function matrix_multiplyScalar(matrixA: Matrix4, v: f32): void { matrixA.multiplyScalar(v); }
// prettier-ignore
function matrix_scale(matrixA: Matrix4, v: Vector3): void { matrixA.scale(v); }
// prettier-ignore
function matrix_scaleSIMD(matrixA: Matrix4, v: Vector3): void { matrixA.scaleSIMD(v); }
// prettier-ignore
function matrix_multiplyScalarSIMD(matrixA: Matrix4, v: f32): void { matrixA.multiplyScalarSIMD(v); }
// prettier-ignore
function matrix_set(matrixA: Matrix4,  n11: f32, n12: f32, n13: f32, n14: f32, n21: f32, n22: f32, n23: f32, n24: f32, n31: f32, n32: f32, n33: f32, n34: f32, n41: f32, n42: f32, n43: f32, n44: f32): void {
  matrixA.set( n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44 );
}

export {
  allocatePerfTest,
  deallocatePerfTest,
  testASMultiplicationPerformance,
  testASMultiplicationPerformanceWithSIMD,
  testMat4SIMDPerformance,
  testMat4Performance,
  newMatrix4,
  newVector3,
  matrix_elements,
  matrix_multiply,
  matrix_multiplySIMD,
  matrix_multiplyScalar,
  matrix_multiplyScalarSIMD,
  matrix_set,
  matrix_scale,
  matrix_scaleSIMD,
};
