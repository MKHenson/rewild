import { Side } from "../../common/GPUEnums";
let object3DId: i32 = 1;

export class Pipeline {
  name: string;
  index: i32;
  side: Side;
  readonly id: i32 = object3DId++;

  constructor(name: string, index: i32) {
    this.name = name;
    this.index = index;
    this.side = Side.FrontSide;
  }

  clone(): Pipeline {
    return new Pipeline(this.name, this.index);
  }

  copy(source: Pipeline): Pipeline {
    this.name = source.name;
    this.index = source.index;
    return this;
  }
}
