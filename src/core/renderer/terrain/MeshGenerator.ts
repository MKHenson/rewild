import { AttributeType, Vector2, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { Renderer } from '../Renderer';
import { pipelineManager } from '../AssetManagers/PipelineManager';
import { TerrainChunk } from '../TerrainChunk';

export class MeshGenerator {
  static generateTerrainMesh(heighMap: f32[][], heightMultiplier: f32 = 1) {
    const width = heighMap.length;
    const height = heighMap[0].length;
    const topLeftX = width / -2; // (width - 1) / -2;
    const topLeftZ = height / 2; // (height - 1) / 2;

    const meshData = new MeshData(width, height);
    let vertexIndex: i32 = 0;

    for (let y: i32 = 0; y < height; y++) {
      for (let x: i32 = 0; x < width; x++) {
        meshData.vertices[vertexIndex] = new Vector3(
          topLeftX + x,
          heighMap[x][y] * heightMultiplier,
          topLeftZ - y
        );
        meshData.uvs[vertexIndex] = new Vector2(x / width, y / height);

        if (x < width - 1 && y < height - 1) {
          meshData.addTriangle(
            vertexIndex,
            vertexIndex + width + 1,
            vertexIndex + width
          );
          meshData.addTriangle(
            vertexIndex + width + 1,
            vertexIndex,
            vertexIndex + 1
          );
        }

        vertexIndex++;
      }
    }

    // var v0 = new Vector3();
    // var v1 = new Vector3();
    // var v2 = new Vector3();
    // for (var xi = 0; xi < height - 1; xi++) {
    //   for (var yi = 0; yi < width - 1; yi++) {
    //     for (var k = 0; k < 2; k++) {
    //       shape.getConvexTrianglePillar(xi, yi, k === 0);
    //       v0.copy(shape.pillarConvex.vertices[0]);
    //       v1.copy(shape.pillarConvex.vertices[1]);
    //       v2.copy(shape.pillarConvex.vertices[2]);
    //       v0.vadd(shape.pillarOffset, v0);
    //       v1.vadd(shape.pillarOffset, v1);
    //       v2.vadd(shape.pillarOffset, v2);
    //       geometry.vertices.push(
    //         new THREE.Vector3(v0.x, v0.y, v0.z),
    //         new THREE.Vector3(v1.x, v1.y, v1.z),
    //         new THREE.Vector3(v2.x, v2.y, v2.z)
    //       );
    //       var i = geometry.vertices.length - 3;
    //       geometry.faces.push(new THREE.Face3(i, i + 1, i + 2));
    //     }
    //   }
    // }

    return meshData;
  }
}

class MeshData {
  vertices: Vector3[];
  triangles: i32[];
  uvs: Vector2[];
  triangleIndex: i32 = 0;
  meshSize: i32;

  constructor(meshWidth: i32, meshHeight: i32) {
    this.meshSize = meshWidth;
    this.vertices = new Array(meshWidth * meshHeight);
    this.uvs = new Array(meshWidth * meshHeight);
    this.triangles = new Array(6 * (meshWidth - 1) * (meshHeight - 1));
  }

  addTriangle(a: i32, b: i32, c: i32): void {
    this.triangles[this.triangleIndex] = a;
    this.triangles[this.triangleIndex + 1] = b;
    this.triangles[this.triangleIndex + 2] = c;
    this.triangleIndex += 3;
  }

  public createMesh(renderer: Renderer, chunkPtr: any): TerrainChunk {
    const geometry = new Geometry();

    const data = new Float32Array(this.vertices.map((v) => v.toArray()).flat());
    geometry.setAttribute(AttributeType.POSITION, data, 3);

    const uvData = new Float32Array(this.uvs.map((v) => v.toArray()).flat());
    geometry.setAttribute(AttributeType.UV, uvData, 2);
    geometry.computeVertexNormals();
    geometry.setIndexes(this.triangles);

    geometry.build(renderer);

    const pipeline = pipelineManager.getAsset('terrain');
    const chunk = new TerrainChunk(
      chunkPtr,
      this.meshSize,
      this.vertices[1].x - this.vertices[0].x,
      this.vertices.map((v) => v.y),
      geometry,
      pipeline,
      renderer
    );
    return chunk;
  }
}
