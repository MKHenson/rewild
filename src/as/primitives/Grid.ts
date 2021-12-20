import { ATTR_POSITION_LOC } from "../../common/ShaderConstants";
import { DataType, BufferObjects, PrimitiveType, UsageType } from "../../common/GLEnums";
import { Vao } from "../objects/Vao";
import { BridgeManager } from "../core/BridgeManager";
import { f32Array, toTypedArray } from "../utils";
import { Material } from "../materials/Material";
import { AttributeTypes, BufferGeometry } from "../core/BufferGeometry";
import { Float32BufferAttribute } from "../core/BufferAttribute";

export class GridAxis {
  static createMesh(material: Material, incAxis: boolean = true): Vao {
    // Dynamiclly create a grid
    const verts = new Array<f32>(),
      size: f32 = 1.8, // W/H of the outer box of the grid, from origin we can only go 1 unit in each direction, so from left to right is 2 units max
      div: f32 = 10.0, // How to divide up the grid
      step: f32 = size / div, // Steps between each line, just a number we increment by for each line in the grid.
      half: f32 = size / 2; // From origin the starting position is half the size.

    let p: f32; //Temp variable for position value.

    for (let i: f32 = 0; i <= div; i++) {
      //Vertical line
      p = -half + i * step;
      verts.push(p); //x1
      verts.push(0); //y1 verts.push(half);
      verts.push(half); //z1 verts.push(0);
      verts.push(0); //c2

      verts.push(p); //x2
      verts.push(0); //y2 verts.push(-half);
      verts.push(-half); //z2 verts.push(0);
      verts.push(0); //c2 verts.push(1);

      //Horizontal line
      p = half - i * step;
      verts.push(-half); //x1
      verts.push(0); //y1 verts.push(p);
      verts.push(p); //z1 verts.push(0);
      verts.push(0); //c1

      verts.push(half); //x2
      verts.push(0); //y2 verts.push(p);
      verts.push(p); //z2 verts.push(0);
      verts.push(0); //c2 verts.push(1);
    }

    if (incAxis) {
      //x axis
      verts.push(-1.1); //x1
      verts.push(0); //y1
      verts.push(0); //z1
      verts.push(1); //c2

      verts.push(1.1); //x2
      verts.push(0); //y2
      verts.push(0); //z2
      verts.push(1); //c2

      //y axis
      verts.push(0); //x1
      verts.push(-1.1); //y1
      verts.push(0); //z1
      verts.push(2); //c2

      verts.push(0); //x2
      verts.push(1.1); //y2
      verts.push(0); //z2
      verts.push(2); //c2

      //z axis
      verts.push(0); //x1
      verts.push(0); //y1
      verts.push(-1.1); //z1
      verts.push(3); //c2

      verts.push(0); //x2
      verts.push(0); //y2
      verts.push(1.1); //z2
      verts.push(3); //c2
    }

    const bridge = BridgeManager.getBridge();
    const geom = new BufferGeometry();
    geom.setAttribute(AttributeTypes.POSITION, new Float32BufferAttribute(f32Array(verts), 3));

    // Setup
    const attrColorLoc: u8 = 4;
    const mesh: Vao = new Vao(geom, material);

    mesh.drawMode = PrimitiveType.LINES;
    mesh.vao = bridge.createVertexArray();
    let strideLen: u32;

    // Do some math
    mesh.vertexComponentLen = 4;
    mesh.vertexCount = u16(verts.length / mesh.vertexComponentLen);
    strideLen = Float32Array.BYTES_PER_ELEMENT * mesh.vertexComponentLen; //Stride Length is the Vertex Size for the buffer in Bytes

    // Setup our Buffer
    mesh.bufVertices = bridge.createBuffer();
    bridge.bindVertexArray(mesh.vao);
    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, mesh.bufVertices);
    bridge.bufferData(
      BufferObjects.ARRAY_BUFFER,
      toTypedArray<f32, Float32Array>(verts, Float32Array.BYTES_PER_ELEMENT),
      UsageType.STATIC_DRAW
    );
    bridge.enableVertexAttribArray(ATTR_POSITION_LOC);
    bridge.enableVertexAttribArray(attrColorLoc);

    bridge.vertexAttribPointer(
      ATTR_POSITION_LOC, //Attribute Location
      3, //How big is the vector by number count
      DataType.FLOAT, //What type of number we passing in
      false, //Does it need to be normalized?
      strideLen, //How big is a vertex chunk of data.
      0 //Offset by how much
    );

    bridge.vertexAttribPointer(
      attrColorLoc, //new shader has "in float a_color" as the second attrib
      1, //This atttrib is just a single float
      DataType.FLOAT,
      false,
      strideLen, //Each vertex chunk is 4 floats long
      Float32Array.BYTES_PER_ELEMENT * 3 //skip first 3 floats in our vertex chunk, its like str.substr(3,1) in theory.
    );

    // Cleanup and Finalize
    bridge.bindVertexArray(-1);
    bridge.bindBuffer(BufferObjects.ARRAY_BUFFER, -1);

    return mesh;
  }
}
