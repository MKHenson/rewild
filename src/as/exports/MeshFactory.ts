import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { BufferGeometry } from "../core/BufferGeometry";
import { Mesh } from "../objects/Mesh";
import { TransformNode } from "../core/TransformNode";
import { PipelineInstance } from "./PipelineFactory";

export function createMesh(
  geometry: BufferGeometry,
  pipeline: PipelineInstance,
  name: string | null = null
): TransformNode {
  const newMesh = new Mesh(geometry, [pipeline as MeshPipelineInstance]);
  if (name) newMesh.name = name;
  return newMesh;
}
