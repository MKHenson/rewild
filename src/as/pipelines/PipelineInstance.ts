import { Side } from "../../common/GPUEnums";
import { AttributeType } from "../../common/AttributeType";
let object3DId: i32 = 1;

export class PipelineInstance {
  name: string;
  index: i32;
  side: Side;
  readonly id: i32 = object3DId++;
  readonly attributes: Map<AttributeType, u16>;

  constructor(name: string, index: i32) {
    this.name = name;
    this.index = index;
    this.side = Side.FrontSide;
    this.attributes = new Map();
  }

  addAttribute(type: AttributeType, location: u16): void {
    if (!this.attributes.has(type)) this.attributes.set(type, location);
  }

  clone(): PipelineInstance {
    return new PipelineInstance(this.name, this.index);
  }

  copy(source: PipelineInstance): PipelineInstance {
    this.name = source.name;
    this.index = source.index;
    return this;
  }
}
