export * from './extras/io';
export * from './extras/ui';
export * from './objects';
export { createMeshPipelineInstance } from './pipelines/MeshPipelineInstance';
export { addPipelineAttribute } from './pipelines/PipelineInstance';
export { createMeshComponent } from './components/MeshComponent';
export * from './lights/index';
export * from './components/index';
export * from './objects/physics/index';

export {
  getRuntime,
  init,
  resize,
  update,
  getScene,
  getCamera,
} from './WasmManager';

export {
  getCameraProjectionInverseMatrix,
  getCameraProjectionMatrix,
  getCameraWorldInverseMatrix,
} from './cameras/Camera';

export {
  addChild,
  createTransformNode,
  removeChild,
  getVisibility,
  setVisibility,
  addComponent,
  removeComponent,
  disposeObject,
  getDataProperties,
  getId,
  setId,
  lookAt,
  setPosition,
  setRotation,
  setScale,
  getTransformModelViewMatrix,
  getTransformNormalMatrix,
  getTransformWorldMatrix,
} from './core/TransformNode';

export {
  creatBufferGeometry,
  createBufferAttributeF32,
  setBufferAttribute,
  createBufferAttributeu32,
  setIndexAttribute,
} from './core/BufferGeometry';

export const Float32ArrayID = idof<Float32Array>();

export function foo(): i32[] {
  return new Array<i32>();
}
