import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { BufferGeometry } from "../core/BufferGeometry";
import { Mesh } from "../objects/Mesh";

export function createMesh(geometry: BufferGeometry, pipeline: MeshPipelineInstance): Mesh {
  const newMesh = new Mesh(geometry, [pipeline]);
  return newMesh;
}
