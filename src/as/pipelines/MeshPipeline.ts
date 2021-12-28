import { Pipeline } from "./Pipeline";

export class MeshPipeline extends Pipeline {
  transformResourceIndex: i32;
  transformGroupId: i32;
  materialGroupId: i32;
  lightingGroupId: i32;
  diffuseResourceIndex: i32;

  constructor(name: string, index: i32) {
    super(name, index);
    this.transformResourceIndex = -1;
    this.diffuseResourceIndex = -1;
  }

  clone(): Pipeline {
    return new MeshPipeline(this.name, this.index).copy(this);
  }

  copy(source: MeshPipeline): Pipeline {
    super.copy(source);
    this.transformResourceIndex = source.transformResourceIndex;
    this.transformGroupId = source.transformResourceIndex;
    this.materialGroupId = source.materialGroupId;
    this.lightingGroupId = source.lightingGroupId;
    this.diffuseResourceIndex = source.diffuseResourceIndex;
    return this;
  }
}
