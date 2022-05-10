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
    m.transpose();
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
    m.transposeSIMD();
  }
}

// prettier-ignore
function newMatrix4(): Matrix4 { return new Matrix4(); }
// prettier-ignore
function newVector3(x: f32 = 0, y: f32 = 0, z: f32 = 0): Vector3 { return new Vector3(x, y, z); }
// prettier-ignore
function matrix_elements(matrix: Matrix4): usize { return changetype<usize>( matrix.elements); }
// prettier-ignore
function matrix_multiply(matrixA: Matrix4, matrixB: Matrix4): Matrix4 { return matrixA.multiply(matrixB); }
// prettier-ignore
function matrix_multiplySIMD(matrixA: Matrix4, matrixB: Matrix4): Matrix4 { return matrixA.multiplySIMD(matrixB); }
// prettier-ignore
function matrix_multiplyScalar(matrixA: Matrix4, v: f32): Matrix4 { return matrixA.multiplyScalar(v); }
// prettier-ignore
function matrix_scale(matrixA: Matrix4, v: Vector3): Matrix4 { return matrixA.scale(v); }
// prettier-ignore
function matrix_makeRotationX(matrixA: Matrix4, v: f32): Matrix4 { return matrixA.makeRotationX(v); }
// prettier-ignore
function matrix_makeRotationY(matrixA: Matrix4, v: f32): Matrix4 { return matrixA.makeRotationY(v); }
// prettier-ignore
function matrix_makeRotationZ(matrixA: Matrix4, v: f32): Matrix4 { return matrixA.makeRotationZ(v); }
// prettier-ignore
function matrix_makePerspective(matrixA: Matrix4, l: f32, r: f32, t: f32, b: f32, n: f32, f: f32): Matrix4 { return matrixA.makePerspective(l, r, t, b, n, f); }
// prettier-ignore
function matrix_makeTranslation(matrixA: Matrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeTranslation(x, y, z); }
// prettier-ignore
function matrix_makeScale(matrixA: Matrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeScale(x, y, z); }
// prettier-ignore
function matrix_determinant(matrixA: Matrix4): f32 { return matrixA.determinant(); }
// prettier-ignore
function matrix_multiplyMatrices(matrixA: Matrix4, a: Matrix4, b: Matrix4): Matrix4 { return matrixA.multiplyMatrices(a, b); }

// prettier-ignore
function matrix_scaleSIMD(matrixA: Matrix4, v: Vector3): Matrix4 { return matrixA.scaleSIMD(v); }
// prettier-ignore
function matrix_clone(matrixA: Matrix4): Matrix4 { return matrixA.clone(); }
// prettier-ignore
function matrix_copy(matrixA: Matrix4, matrixB: Matrix4): Matrix4 {return  matrixA.copy(matrixB); }
// prettier-ignore
function matrix_transpose(matrixA: Matrix4): Matrix4 {return  matrixA.transpose(); }
// prettier-ignore
function matrix_transposeSIMD(matrixA: Matrix4): Matrix4 {return  matrixA.transposeSIMD(); }
// prettier-ignore
function matrix_invert(matrixA: Matrix4): Matrix4 {return  matrixA.invert(); }

// prettier-ignore
function matrix_multiplyScalarSIMD(matrixA: Matrix4, v: f32): Matrix4 { return matrixA.multiplyScalarSIMD(v); }
// prettier-ignore
function matrix_set(matrixA: Matrix4,  n11: f32, n12: f32, n13: f32, n14: f32, n21: f32, n22: f32, n23: f32, n24: f32, n31: f32, n32: f32, n33: f32, n34: f32, n41: f32, n42: f32, n43: f32, n44: f32): Matrix4 {
  return matrixA.set( n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44 );
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
  matrix_clone,
  matrix_transpose,
  matrix_transposeSIMD,
  matrix_copy,
  matrix_invert,
  matrix_makeRotationX,
  matrix_makeRotationY,
  matrix_makeRotationZ,
  matrix_makePerspective,
  matrix_makeTranslation,
  matrix_makeScale,
  matrix_determinant,
  matrix_multiplyMatrices,
};
