import { AttributeType, Vector2, Vector3 } from "packages/rewild-common";
import { Geometry } from "../geometry/Geometry";
import { Mesh } from "../Mesh";
import { Renderer } from "../Renderer";
import { pipelineManager } from "../AssetManagers/PipelineManager";

export class MeshGenerator {
  static generateTerrainMesh(heighMap: f32[][], heightMultiplier: f32 = 20) {
    const width = heighMap.length;
    const height = heighMap[0].length;
    const topLeftX = (width - 1) / -2;
    const topLeftZ = (height - 1) / 2;

    const meshData = new MeshData(width, height);
    let vertexIndex: i32 = 0;

    for (let y: i32 = 0; y < height; y++) {
      for (let x: i32 = 0; x < width; x++) {
        meshData.vertices[vertexIndex] = new Vector3(topLeftX + x, heighMap[x][y] * heightMultiplier, topLeftZ - y);
        meshData.uvs[vertexIndex] = new Vector2(x / width, y / height);

        if (x < width - 1 && y < height - 1) {
          meshData.addTriangle(vertexIndex, vertexIndex + width + 1, vertexIndex + width);
          meshData.addTriangle(vertexIndex + width + 1, vertexIndex, vertexIndex + 1);
        }

        vertexIndex++;
      }
    }

    return meshData;
  }
}

class MeshData {
  vertices: Vector3[];
  triangles: i32[];
  uvs: Vector2[];
  triangleIndex: i32 = 0;

  constructor(meshWidth: i32, meshHeight: i32) {
    this.vertices = new Array(meshWidth * meshHeight);
    this.uvs = new Array(meshWidth * meshHeight);
    this.triangles = new Array(6 * (meshWidth - 1) * (meshHeight - 1));
  }

  addTriangle(a: i32, b: i32, c: i32) {
    this.triangles[this.triangleIndex] = a;
    this.triangles[this.triangleIndex + 1] = b;
    this.triangles[this.triangleIndex + 2] = c;
    this.triangleIndex += 3;
  }

  public createMesh(renderer: Renderer) {
    const geometry = new Geometry();

    const data = new Float32Array(this.vertices.map((v) => v.toArray()).flat());
    geometry.setAttribute(AttributeType.POSITION, data, 3);

    const uvData = new Float32Array(this.uvs.map((v) => v.toArray()).flat());
    geometry.setAttribute(AttributeType.UV, uvData, 2);
    geometry.computeVertexNormals();
    geometry.setIndexes(this.triangles);

    geometry.build(renderer);

    const pipeline = pipelineManager.getAsset("terrain");
    const mesh = new Mesh(geometry, pipeline, renderer);
    return mesh;
  }
}
