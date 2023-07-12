export * from "./extras/io";
export * from "./extras/ui";
export {
  getRuntime,
  init,
  resize,
  update,
  addContainer,
  removeContainer,
} from "./objects/routing/AsSceneManager";
export { createMeshPipelineInstance } from "./pipelines/MeshPipelineInstance";
export { addPipelineAttribute } from "./pipelines/PipelineInstance";
export { createMeshComponent } from "./components/MeshComponent";

export * from "./components/index";
export * from "./terrain/index";
export * from "./objects/physics/index";

export { createContainer, addAsset } from "./objects/routing";
export {
  getCameraProjectionInverseMatrix,
  getCameraProjectionMatrix,
  getCameraWorldInverseMatrix,
} from "./cameras/Camera";

export {
  addChild,
  createTransformNode,
  removeChild,
  getVisibility,
  setVisibility,
  addComponent,
  getDataProperties,
  getId,
  setId,
  getTransformModelViewMatrix,
  getTransformNormalMatrix,
  getTransformWorldMatrix,
} from "./core/TransformNode";
export {
  creatBufferGeometry,
  createBufferAttributeF32,
  setBufferAttribute,
  createBufferAttributeu32,
  setIndexAttribute,
} from "./core/BufferGeometry";

export const Float32ArrayID = idof<Float32Array>();

export function foo(): i32[] {
  return new Array<i32>();
}
