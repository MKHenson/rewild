export * from "./extras/io";
export * from "./extras/ui";
export { getRuntime, init, resize, update, addContainer } from "./objects/routing/AsSceneManager";
export * from "./geometries";
export { createMeshPipelineInstance, setMeshPipelineTransformIndex } from "./pipelines/MeshPipelineInstance";
export { addPipelineAttribute } from "./pipelines/PipelineInstance";
export { createMesh, setMeshRenderIndex } from "./objects/MeshNode";
export { createContainer, addAsset, createLevel1, createMainMenu, createTestLevel } from "./objects/routing";
export { addChild, createTransformNode, removeChild, getVisibility, setVisibility } from "./core/TransformNode";

export const Float32ArrayID = idof<Float32Array>();

export function foo(): i32[] {
  return new Array<i32>();
}
