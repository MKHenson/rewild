import { AttributeType } from "rewild-common";

export class VertexAttribute {
  constructor(
    public attributeType: AttributeType,
    public shaderLocation: number,
    public format: GPUVertexFormat,
    public offset: number
  ) {}
}
