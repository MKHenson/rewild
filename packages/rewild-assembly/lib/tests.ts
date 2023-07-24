import { EngineMatrix4 } from "./math/Matrix4";
import { Matrix4, Matrix3 } from "rewild-common";
import { EngineVector3 } from "./math/Vector3";

export {
  addNodeToRuntime,
  getRuntime,
  init,
  removeNodeFromRuntime,
  update,
  getActiveNodeCount,
  getNodeCount,
} from "./objects/routing/AsSceneManager";
export {
  addChild,
  removeChild,
  getVisibility,
  setVisibility,
  addComponent,
} from "./core/TransformNode";
export {
  createContainer,
  addChildNode,
  connectLink,
  createLink,
  addNodePortal,
  getNodePortal,
  removeNodePortal,
  createPortal,
  addAsset,
  exitNode,
} from "../lib/objects/routing/index";
export * from "./tests/routers";
export * from "./tests/helpers";
export * from "./tests/performance.spec";
export * from "./tests/TransformNode.spec";
export * from "./tests/PlayerComponent.spec";
export * from "./tests/PhysicsComponent.spec";
export * from "../lib/objects/physics/common-bodies";

// prettier-ignore
function newMatrix4(): EngineMatrix4 { return new EngineMatrix4(); }
// prettier-ignore
function newMatrix3(): Matrix3 { return new Matrix3(); }
// prettier-ignore
function newVector3(x: f32 = 0, y: f32 = 0, z: f32 = 0): EngineVector3 { return new EngineVector3(x, y, z); }
// prettier-ignore
function matrix4_elements(matrix: EngineMatrix4): usize { return changetype<usize>( matrix.elements); }
// prettier-ignore
function matrix4_multiply(matrixA: EngineMatrix4, matrixB: EngineMatrix4): Matrix4 { return matrixA.multiply(matrixB); }
// prettier-ignore
function matrix4_multiplySIMD(matrixA: EngineMatrix4, matrixB: EngineMatrix4): Matrix4 { return matrixA.multiplySIMD(matrixB); }
// prettier-ignore
function matrix4_multiplyScalar(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.multiplyScalar(v); }
// prettier-ignore
function matrix4_scale(matrixA: EngineMatrix4, v: EngineVector3): Matrix4 { return matrixA.scale(v); }
// prettier-ignore
function matrix4_makeRotationX(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationX(v); }
// prettier-ignore
function matrix4_makeRotationY(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationY(v); }
// prettier-ignore
function matrix4_makeRotationZ(matrixA: EngineMatrix4, v: f32): Matrix4 { return matrixA.makeRotationZ(v); }
// prettier-ignore
function matrix4_makePerspective(matrixA: EngineMatrix4, l: f32, r: f32, t: f32, b: f32, n: f32, f: f32): Matrix4 { return matrixA.makePerspective(l, r, t, b, n, f); }
// prettier-ignore
function matrix4_makeTranslation(matrixA: EngineMatrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeTranslation(x, y, z); }
// prettier-ignore
function matrix4_makeScale(matrixA: EngineMatrix4, x: f32, y: f32, z: f32): Matrix4 { return matrixA.makeScale(x, y, z); }
// prettier-ignore
function matrix4_determinant(matrixA: EngineMatrix4): f32 { return matrixA.determinant(); }
// prettier-ignore
function matrix4_multiplyMatrices(matrixA: EngineMatrix4, a: EngineMatrix4, b: EngineMatrix4): Matrix4 { return matrixA.multiplyMatrices(a, b); }

// prettier-ignore
function matrix4_scaleSIMD(matrixA: EngineMatrix4, v: EngineVector3): EngineMatrix4 { return matrixA.scaleSIMD(v); }
// prettier-ignore
function matrix4_clone(matrixA: EngineMatrix4): EngineMatrix4 { return matrixA.clone(); }
// prettier-ignore
function matrix4_copy(matrixA: EngineMatrix4, matrixB: EngineMatrix4): EngineMatrix4 {return  matrixA.copy(matrixB); }
// prettier-ignore
function matrix4_transpose(matrixA: EngineMatrix4): Matrix4 {return  matrixA.transpose(); }
// prettier-ignore
function matrix4_transposeSIMD(matrixA: EngineMatrix4): EngineMatrix4 {return  matrixA.transposeSIMD(); }
// prettier-ignore
function matrix4_invert(matrixA: EngineMatrix4): Matrix4 {return  matrixA.invert(); }
// prettier-ignore
function matrix4_invertSIMD(matrixA: EngineMatrix4): EngineMatrix4 { return matrixA.invertSIMD(); }
// prettier-ignore
function matrix4_multiplyScalarSIMD(matrixA: EngineMatrix4, v: f32): EngineMatrix4 { return matrixA.multiplyScalarSIMD(v); }
// prettier-ignore
function matrix4_set(matrixA: EngineMatrix4,  n11: f32, n12: f32, n13: f32, n14: f32, n21: f32, n22: f32, n23: f32, n24: f32, n31: f32, n32: f32, n33: f32, n34: f32, n41: f32, n42: f32, n43: f32, n44: f32): Matrix4 {
  return matrixA.set( n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44 );
}

// prettier-ignore
function matrix3_elements(matrix: Matrix3): usize { return changetype<usize>( matrix.elements); }
// prettier-ignore
function matrix3_identity(matrix: Matrix3): Matrix3 { return matrix.identity(); }
// prettier-ignore
function matrix3_multiply(matrixA: Matrix3, matrixB: Matrix3): Matrix3 { return matrixA.multiply(matrixB); }
// prettier-ignore
function matrix3_multiplyScalar(matrixA: Matrix3, scale: f32): Matrix3 { return matrixA.multiplyScalar(scale); }
// prettier-ignore
function matrix3_multiplyMatrices(output: Matrix3, matrixA: Matrix3, matrixB: Matrix3): Matrix3 { return output.multiplyMatrices( matrixA, matrixB); }
// prettier-ignore
function matrix3_set(matrixA: Matrix3,  n11: f32, n12: f32, n13: f32, n21: f32, n22: f32, n23: f32, n31: f32, n32: f32, n33: f32 ): Matrix3 {
  return matrixA.set( n11, n12, n13, n21, n22, n23, n31, n32, n33  );
}
// prettier-ignore
function matrix3_clone(matrixA: Matrix3): Matrix3 {
  return matrixA.clone();
}

export {
  newMatrix4,
  newMatrix3,
  newVector3,
  matrix4_elements as matrix4_elements,
  matrix4_multiply,
  matrix4_multiplySIMD,
  matrix4_multiplyScalar,
  matrix4_multiplyScalarSIMD,
  matrix4_set,
  matrix4_scale,
  matrix4_scaleSIMD,
  matrix4_clone,
  matrix4_transpose,
  matrix4_transposeSIMD,
  matrix4_copy,
  matrix4_invert,
  matrix4_makeRotationX,
  matrix4_makeRotationY,
  matrix4_makeRotationZ,
  matrix4_makePerspective,
  matrix4_makeTranslation,
  matrix4_makeScale,
  matrix4_determinant,
  matrix4_multiplyMatrices,
  matrix4_invertSIMD,
  matrix3_set,
  matrix3_multiply,
  matrix3_multiplyMatrices,
  matrix3_elements,
  matrix3_identity,
  matrix3_clone,
  matrix3_multiplyScalar,
};
