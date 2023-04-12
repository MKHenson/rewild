import { PipelineInstance } from "./PipelineInstance";

export class MeshPipelineInstance extends PipelineInstance {
  transformResourceIndex: i32;

  constructor(name: string, index: i32) {
    super(name, index);
    this.transformResourceIndex = -1;
  }

  clone(): PipelineInstance {
    return new MeshPipelineInstance(this.name, this.index).copy(this);
  }

  copy(source: MeshPipelineInstance): PipelineInstance {
    super.copy(source);
    this.transformResourceIndex = source.transformResourceIndex;
    return this;
  }
}

export function createMeshPipelineInstance(name: string, index: i32): PipelineInstance {
  return new MeshPipelineInstance(name, index);
}

export function setMeshPipelineTransformIndex(pipeline: PipelineInstance, transformResourceIndex: i32): void {
  const meshPipeline = pipeline as MeshPipelineInstance;
  meshPipeline.transformResourceIndex = transformResourceIndex;
}
