export * from "./extras/io";
export * from "./extras/ui";
export { getRuntime, init, resize, update, addContainer } from "./objects/routing/AsSceneManager";
export { createMeshPipelineInstance, setMeshPipelineTransformIndex } from "./pipelines/MeshPipelineInstance";
export { addPipelineAttribute } from "./pipelines/PipelineInstance";
export { createMeshComponent, setMeshRenderIndex } from "./components/MeshComponent";
export { createContainer, addAsset, createLevel1, createMainMenu, createTestLevel } from "./objects/routing";
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
