import { PipelineInstance } from "./PipelineInstance";

export class MeshPipelineInstance extends PipelineInstance {
  constructor(name: string, index: i32) {
    super(name, index);
  }

  clone(): PipelineInstance {
    return new MeshPipelineInstance(this.name, this.index).copy(this);
  }

  copy(source: MeshPipelineInstance): PipelineInstance {
    super.copy(source);
    return this;
  }
}

export function createMeshPipelineInstance(
  name: string,
  index: i32
): PipelineInstance {
  return new MeshPipelineInstance(name, index);
}
