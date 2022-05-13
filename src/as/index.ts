export * from "./exports/io";
export * from "./exports/ui";
export { getRuntime, init, resize, update, addContainer } from "./exports/AsSceneManager";
export { createTexture } from "./exports/TextureFactory";
export { createBox, createPlane, createSphere, addVertGeometry } from "./exports/GeometryFactory";
export { createPipelineInstance, addPipelineAttribute, setMeshPipelineTransformIndex } from "./exports/PipelineFactory";
export { createMesh } from "./exports/MeshFactory";
export { createContainer, addAsset, createLevel1, createMainMenu, createTestLevel } from "./objects/routing";
export { createTransformNode } from "./exports/ObjectFactory";

export const Float32ArrayID = idof<Float32Array>();

export function foo(): i32[] {
  return new Array<i32>();
}
