import { VertexAttribute } from "./VertexAttribute";

export class VertexBufferLayout {
  constructor(public arrayStride: number, public attributes: VertexAttribute[], public stepMode?: GPUVertexStepMode) {}
}
