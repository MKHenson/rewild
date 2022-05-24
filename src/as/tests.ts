import { EngineMatrix4 } from "./math/Matrix4";
import { Matrix4 } from "../common/math/Matrix4";
import { EngineVector3 } from "./math/Vector3";

export * from "./tests/performance.spec";
export * from "./tests/TransformNode.spec";

// prettier-ignore
function newMatrix4(): EngineMatrix4 { return new EngineMatrix4(); }
// prettier-ignore
function newVector3(x: f32 = 0, y: f32 = 0, z: f32 = 0): EngineVector3 { return new EngineVector3(x, y, z); }
// prettier-ignore
function matrix_elements(matrix: EngineMatrix4): usize { return changetype<usize>( matrix.elements); }
// prettier-ignore
function matrix_multiply(matrixA: EngineMatrix4, matrixB: EngineMatrix4): Matrix4 { return matrixA.multiply(matrixB); }
// prettier-ignore
function matrix_multiplySIMD(matrixA: EngineMatrix4, matrixB: EngineMatrix4): Matrix4 { return matrixA.multiplySIMD(matrixB); }
// prettier-ignore
function matrix_multiplyScalar(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.multiplyScalar(v); }
// prettier-ignore
function matrix_scale(matrixA: EngineMatrix4, v: EngineVector3): Matrix4 { return matrixA.scale(v); }
// prettier-ignore
function matrix_makeRotationX(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationX(v); }
// prettier-ignore
function matrix_makeRotationY(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationY(v); }
// prettier-ignore
function matrix_makeRotationZ(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationZ(v); }
// prettier-ignore
function matrix_makePerspective(matrixA: EngineMatrix4, l: f32, r: f32, t: f32, b: f32, n: f32, f: f32): Matrix4 { return matrixA.makePerspective(l, r, t, b, n, f); }
// prettier-ignore
function matrix_makeTranslation(matrixA: EngineMatrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeTranslation(x, y, z); }
// prettier-ignore
function matrix_makeScale(matrixA: EngineMatrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeScale(x, y, z); }
// prettier-ignore
function matrix_determinant(matrixA: EngineMatrix4): f32 { return matrixA.determinant(); }
// prettier-ignore
function matrix_multiplyMatrices(matrixA: EngineMatrix4, a: EngineMatrix4, b: EngineMatrix4): Matrix4 { return matrixA.multiplyMatrices(a, b); }

// prettier-ignore
function matrix_scaleSIMD(matrixA: EngineMatrix4, v: EngineVector3): EngineMatrix4 { return matrixA.scaleSIMD(v); }
// prettier-ignore
function matrix_clone(matrixA: EngineMatrix4): EngineMatrix4 { return matrixA.clone(); }
// prettier-ignore
function matrix_copy(matrixA: EngineMatrix4, matrixB: EngineMatrix4): EngineMatrix4 {return  matrixA.copy(matrixB); }
// prettier-ignore
function matrix_transpose(matrixA: EngineMatrix4): Matrix4 {return  matrixA.transpose(); }
// prettier-ignore
function matrix_transposeSIMD(matrixA: EngineMatrix4): EngineMatrix4 {return  matrixA.transposeSIMD(); }
// prettier-ignore
function matrix_invert(matrixA: EngineMatrix4): Matrix4 {return  matrixA.invert(); }
// prettier-ignore
function matrix_invertSIMD(matrixA: EngineMatrix4): EngineMatrix4 { return matrixA.invertSIMD(); }
// prettier-ignore
function matrix_multiplyScalarSIMD(matrixA: EngineMatrix4, v: f32): EngineMatrix4 { return matrixA.multiplyScalarSIMD(v); }
// prettier-ignore
function matrix_set(matrixA: EngineMatrix4,  n11: f32, n12: f32, n13: f32, n14: f32, n21: f32, n22: f32, n23: f32, n24: f32, n31: f32, n32: f32, n33: f32, n34: f32, n41: f32, n42: f32, n43: f32, n44: f32): Matrix4 {
  return matrixA.set( n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44 );
}

export {
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
  matrix_invertSIMD,
};
