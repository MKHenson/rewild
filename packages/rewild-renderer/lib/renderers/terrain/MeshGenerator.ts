import { Vector2, Vector3 } from 'rewild-common';

export function generateTerrainMesh(
  heightmap: Float32Array,
  width: number,
  height: number
) {
  const topLeftX = (width - 1) / -2;
  const topLeftZ = (height - 1) / 2;

  const meshData = new MeshData(width, height);
  let vertexIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const heightValue = heightmap[y * width + x] * 10;
      meshData.vertices[vertexIndex] = new Vector3(
        topLeftX + x,
        heightValue,
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

  return meshData;
}

export class MeshData {
  vertices: Vector3[];
  uvs: Vector2[];
  triangles: number[];

  triangleIndex: number = 0;

  constructor(width: number, height: number) {
    this.vertices = new Array(width * height);
    this.uvs = new Array(width * height);
    this.triangles = new Array((width - 1) * (height - 1) * 6).fill(0);
  }

  addTriangle(a: number, b: number, c: number) {
    this.triangles[this.triangleIndex] = a;
    this.triangles[this.triangleIndex + 1] = b;
    this.triangles[this.triangleIndex + 2] = c;

    this.triangleIndex += 3;
  }
}
