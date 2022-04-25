import { AttributeType } from "../../../common/AttributeType";

export class VertexAttribute {
  constructor(
    public attributeType: AttributeType,
    public shaderLocation: number,
    public format: GPUVertexFormat,
    public offset: number
  ) {}
}
