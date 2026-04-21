export function generateTerrainMesh(
  heightmap: Float32Array,
  width: number,
  height: number,
  levelOfDetail: number,
  noiseScale: number = 10
) {
  const topLeftX = (width - 1) / -2;
  const topLeftZ = (height - 1) / 2;

  const meshSimplificationIncrement = levelOfDetail === 0 ? 1 : levelOfDetail * 2;
  const verticesPerLine = (width - 1) / meshSimplificationIncrement + 1;

  const meshData = new MeshData(verticesPerLine, verticesPerLine);
  let vertexIndex = 0;

  for (let y = 0; y < height; y += meshSimplificationIncrement) {
    for (let x = 0; x < width; x += meshSimplificationIncrement) {
      const heightValue = heightmap[y * width + x] * noiseScale;
      meshData.setVertex(vertexIndex, topLeftX + x, heightValue, topLeftZ - y, x / width, y / height);

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

// Interleaved layout per vertex: [x, y, z, u, v]
export const MESH_STRIDE = 5;

export class MeshData {
  interleaved: Float32Array;
  triangles: Uint32Array;
  triangleIndex: number = 0;

  constructor(width: number, height: number) {
    this.interleaved = new Float32Array(width * height * MESH_STRIDE);
    this.triangles = new Uint32Array((width - 1) * (height - 1) * 6);
  }

  setVertex(index: number, x: number, y: number, z: number, u: number, v: number) {
    const base = index * MESH_STRIDE;
    this.interleaved[base]     = x;
    this.interleaved[base + 1] = y;
    this.interleaved[base + 2] = z;
    this.interleaved[base + 3] = u;
    this.interleaved[base + 4] = v;
  }

  addTriangle(a: number, b: number, c: number) {
    this.triangles[this.triangleIndex]     = a;
    this.triangles[this.triangleIndex + 1] = b;
    this.triangles[this.triangleIndex + 2] = c;
    this.triangleIndex += 3;
  }
}
