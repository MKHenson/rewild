import { ATTR_NORMAL_LOC, ATTR_POSITION_LOC, ATTR_UV_LOC } from "../../common/ShaderConstants";
import { BridgeManager } from "../core/BridgeManager";
import { toTypedArray } from "../utils";
import { BufferObjects, DataType, PrimitiveType, UsageType } from "../../common/GLEnums";
import { AttributeTypes, BufferGeometry } from "../core/BufferGeometry";
import { Mesh } from "./Mesh";
import { Material } from "../materials/Material";
import { Float32BufferAttribute } from "../core/BufferAttribute";

export class Vao extends Mesh {
  bufVertices: i32;
  bufNormals: i32;
  bufUV: i32;
  bufIndex: i32;
  vao: i32;
  vertexComponentLen: u16;
  drawMode: PrimitiveType;
  indexCount: i32;
  vertexCount: u32;

  constructor(geometry: BufferGeometry, material: Material) {
    super(geometry, [material]);

    this.drawMode = 0;
    this.vao = -1;
    this.bufVertices = -1;
    this.bufNormals = -1;
    this.bufUV = -1;
    this.bufIndex = -1;
    this.vertexComponentLen = 0;
    this.vertexCount = 0;
    this.indexCount = -1;
  }

  createFromGeom(): Vao {
    const geom = this.geometry;
    const vao = this;
    vao.drawMode = PrimitiveType.TRIANGLES;

    const indexes = geom.getIndexes();
    const positionBuffer = geom.getAttribute<Float32BufferAttribute>(AttributeTypes.POSITION);
    const normalBuffer = geom.getAttribute<Float32BufferAttribute>(AttributeTypes.NORMAL);
    const uvBuffer = geom.getAttribute<Float32BufferAttribute>(AttributeTypes.UV);

    const bridge = BridgeManager.getBridge();

    // Create and bind vao
    vao.vao = bridge.createVertexArray();
    bridge.bindVertexArray(vao.vao); // Bind it so all the calls to vertexAttribPointer/enableVertexAttribArray is saved to the vao.

    // .......................................................
    // Set up vertices
    if (positionBuffer !== null) {
      const bufVertices = bridge.createBuffer(); // Create buffer...
      vao.vertexComponentLen = 3; // How many floats make up a vertex
      vao.vertexCount = positionBuffer.count; // How many vertices in the array

      bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, bufVertices);
      bridge.bufferData(BufferObjects.ARRAY_BUFFER, positionBuffer.array, UsageType.STATIC_DRAW); //then push array into it.
      bridge.enableVertexAttribArray(ATTR_POSITION_LOC); // Enable Attribute location
      bridge.vertexAttribPointer(ATTR_POSITION_LOC, 3, DataType.FLOAT, false, 0, 0); // Put buffer at location of the vao
    }

    // .......................................................
    // Setup normals
    if (normalBuffer !== null) {
      vao.bufNormals = bridge.createBuffer();
      bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, vao.bufNormals);
      bridge.bufferData(BufferObjects.ARRAY_BUFFER, normalBuffer.array, UsageType.STATIC_DRAW);
      bridge.enableVertexAttribArray(ATTR_NORMAL_LOC);
      bridge.vertexAttribPointer(ATTR_NORMAL_LOC, 3, DataType.FLOAT, false, 0, 0);
    }

    // .......................................................
    // Setup UV
    if (uvBuffer !== null) {
      vao.bufUV = bridge.createBuffer();
      bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, vao.bufUV);
      bridge.bufferData(BufferObjects.ARRAY_BUFFER, uvBuffer.array, UsageType.STATIC_DRAW);
      bridge.enableVertexAttribArray(ATTR_UV_LOC);
      bridge.vertexAttribPointer(ATTR_UV_LOC, 2, DataType.FLOAT, false, 0, 0); // UV only has two floats per component
    }

    // .......................................................
    // Setup Index.
    if (indexes !== null) {
      vao.bufIndex = bridge.createBuffer();
      vao.indexCount = indexes.count;

      bridge.bindBuffer(BufferObjects.ELEMENT_ARRAY_BUFFER, vao.bufIndex);
      bridge.bufferData(BufferObjects.ELEMENT_ARRAY_BUFFER, indexes.array, UsageType.STATIC_DRAW);
    }

    // Clean up
    bridge.bindVertexArray(-1); // Unbind the VAO, very Important. always unbind when your done using one.
    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, -1); // Unbind any buffers that might be set
    if (indexes != null) bridge.bindBuffer(BufferObjects.ELEMENT_ARRAY_BUFFER, -1);

    return vao;
  }
}

/**
 * Turns arrays into GL buffers, then setup a VAO that will predefine the buffers to standard shader attributes
 */
export function create(
  aryInd: Array<u16> | null,
  aryVert: Array<f32> | null,
  aryNorm: Array<f32> | null,
  aryUV: Array<f32> | null,
  geometry: BufferGeometry,
  material: Material
): Vao {
  const vao = new Vao(geometry, material);
  vao.drawMode = PrimitiveType.TRIANGLES;
  const bridge = BridgeManager.getBridge();

  // Create and bind vao
  vao.vao = bridge.createVertexArray();
  bridge.bindVertexArray(vao.vao); // Bind it so all the calls to vertexAttribPointer/enableVertexAttribArray is saved to the vao.

  // .......................................................
  // Set up vertices
  if (aryVert !== null) {
    const bufVertices = bridge.createBuffer(); // Create buffer...
    vao.vertexComponentLen = 3; // How many floats make up a vertex
    vao.vertexCount = u16(aryVert.length / vao.vertexComponentLen); // How many vertices in the array

    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, bufVertices);
    bridge.bufferData(
      BufferObjects.ARRAY_BUFFER,
      toTypedArray<f32, Float32Array>(aryVert, Float32Array.BYTES_PER_ELEMENT),
      UsageType.STATIC_DRAW
    ); //then push array into it.
    bridge.enableVertexAttribArray(ATTR_POSITION_LOC); // Enable Attribute location
    bridge.vertexAttribPointer(ATTR_POSITION_LOC, 3, DataType.FLOAT, false, 0, 0); // Put buffer at location of the vao
  }

  // .......................................................
  // Setup normals
  if (aryNorm !== null) {
    vao.bufNormals = bridge.createBuffer();
    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, vao.bufNormals);
    bridge.bufferData(
      BufferObjects.ARRAY_BUFFER,
      toTypedArray<f32, Float32Array>(aryNorm, Float32Array.BYTES_PER_ELEMENT),
      UsageType.STATIC_DRAW
    );
    bridge.enableVertexAttribArray(ATTR_NORMAL_LOC);
    bridge.vertexAttribPointer(ATTR_NORMAL_LOC, 3, DataType.FLOAT, false, 0, 0);
  }

  // .......................................................
  // Setup UV
  if (aryUV !== null) {
    vao.bufUV = bridge.createBuffer();
    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, vao.bufUV);
    bridge.bufferData(
      BufferObjects.ARRAY_BUFFER,
      toTypedArray<f32, Float32Array>(aryUV, Float32Array.BYTES_PER_ELEMENT),
      UsageType.STATIC_DRAW
    );
    bridge.enableVertexAttribArray(ATTR_UV_LOC);
    bridge.vertexAttribPointer(ATTR_UV_LOC, 2, DataType.FLOAT, false, 0, 0); // UV only has two floats per component
  }

  // .......................................................
  // Setup Index.
  if (aryInd !== null) {
    vao.bufIndex = bridge.createBuffer();
    vao.indexCount = aryInd.length;

    bridge.bindBuffer(BufferObjects.ELEMENT_ARRAY_BUFFER, vao.bufIndex);
    bridge.bufferData(
      BufferObjects.ELEMENT_ARRAY_BUFFER,
      toTypedArray<u16, Uint16Array>(aryInd, Uint16Array.BYTES_PER_ELEMENT),
      UsageType.STATIC_DRAW
    );
  }

  // Clean up
  bridge.bindVertexArray(-1); // Unbind the VAO, very Important. always unbind when your done using one.
  bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, -1); // Unbind any buffers that might be set
  if (aryInd != null && aryInd !== null) bridge.bindBuffer(BufferObjects.ELEMENT_ARRAY_BUFFER, -1);

  return vao;
}
