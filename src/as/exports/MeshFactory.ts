import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { BufferGeometry } from "../core/BufferGeometry";
import { Mesh } from "../objects/Mesh";

export function createMesh(geometry: BufferGeometry, pipeline: MeshPipelineInstance, name: string | null = null): Mesh {
  const newMesh = new Mesh(geometry, [pipeline]);
  if (name) newMesh.name = name;
  return newMesh;
}
