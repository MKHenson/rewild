import { MeshPipeline } from "../pipelines/MeshPipeline";
import { BufferGeometry } from "../core/BufferGeometry";
import { Mesh } from "../objects/Mesh";

export function createMesh(geometry: BufferGeometry, pipeline: MeshPipeline): Mesh {
  const newMesh = new Mesh(geometry, [pipeline]);
  return newMesh;
}

export { Mesh };
