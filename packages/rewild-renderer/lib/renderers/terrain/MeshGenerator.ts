import { Vector2, Vector3 } from 'rewild-common';

export function generateTerrainMesh(
  heightmap: Float32Array,
  width: number,
  height: number,
  levelOfDetail: number,
  noiseScale: number = 10
) {
  const topLeftX = (width - 1) / -2;
  const topLeftZ = (height - 1) / 2;

  let meshSimplificationIncrement = levelOfDetail === 0 ? 1 : levelOfDetail * 2;
  let verticesPerLine = (width - 1) / meshSimplificationIncrement + 1;

  const meshData = new MeshData(verticesPerLine, verticesPerLine);
  let vertexIndex = 0;

  for (let y = 0; y < height; y += meshSimplificationIncrement) {
    for (let x = 0; x < width; x += meshSimplificationIncrement) {
      const heightValue = heightmap[y * width + x] * noiseScale;
      meshData.vertices[vertexIndex] = new Vector3(
        topLeftX + x,
        heightValue,
        topLeftZ - y
      );
      meshData.uvs[vertexIndex] = new Vector2(x / width, y / height);

      if (x < width - 1 && y < height - 1) {
        meshData.addTriangle(
          vertexIndex,
          vertexIndex + verticesPerLine + 1,
          vertexIndex + verticesPerLine
        );
        meshData.addTriangle(
          vertexIndex + verticesPerLine + 1,
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
