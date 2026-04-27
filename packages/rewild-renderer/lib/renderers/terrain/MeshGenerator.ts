// Interleaved layout per vertex: [x, y, z, u, v]
export const MESH_STRIDE = 5;

export class MeshData {
  interleaved: Float32Array;
  triangles: Uint32Array;
  normals: Float32Array;
  triangleIndex: number = 0;

  constructor(vertexCount: number, indexCount: number) {
    this.interleaved = new Float32Array(vertexCount * MESH_STRIDE);
    this.triangles   = new Uint32Array(indexCount);
    this.normals     = new Float32Array(vertexCount * 3);
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

  // Compute smooth vertex normals using only the first mainIdxCount indices so that
  // skirt triangles added afterwards cannot corrupt the edge vertex normals.
  // Uses the same (C−B)×(A−B) cross product as Geometry.computeNormals().
  computeMainNormals(mainVertCount: number, mainIdxCount: number): void {
    for (let i = 0; i < mainIdxCount; i += 3) {
      const vA = this.triangles[i], vB = this.triangles[i + 1], vC = this.triangles[i + 2];
      const bA = vA * MESH_STRIDE,  bB = vB * MESH_STRIDE,      bC = vC * MESH_STRIDE;

      const cbX = this.interleaved[bC]     - this.interleaved[bB];
      const cbY = this.interleaved[bC + 1] - this.interleaved[bB + 1];
      const cbZ = this.interleaved[bC + 2] - this.interleaved[bB + 2];
      const abX = this.interleaved[bA]     - this.interleaved[bB];
      const abY = this.interleaved[bA + 1] - this.interleaved[bB + 1];
      const abZ = this.interleaved[bA + 2] - this.interleaved[bB + 2];

      const nx = cbY * abZ - cbZ * abY;
      const ny = cbZ * abX - cbX * abZ;
      const nz = cbX * abY - cbY * abX;

      this.normals[vA * 3]     += nx; this.normals[vA * 3 + 1] += ny; this.normals[vA * 3 + 2] += nz;
      this.normals[vB * 3]     += nx; this.normals[vB * 3 + 1] += ny; this.normals[vB * 3 + 2] += nz;
      this.normals[vC * 3]     += nx; this.normals[vC * 3 + 1] += ny; this.normals[vC * 3 + 2] += nz;
    }

    for (let i = 0; i < mainVertCount * 3; i += 3) {
      const nx = this.normals[i], ny = this.normals[i + 1], nz = this.normals[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        this.normals[i] /= len; this.normals[i + 1] /= len; this.normals[i + 2] /= len;
      } else {
        this.normals[i] = 0; this.normals[i + 1] = 1; this.normals[i + 2] = 0;
      }
    }
  }
}

export function generateTerrainMesh(
  heightmap: Float32Array,
  width: number,
  height: number,
  levelOfDetail: number,
  noiseScale: number = 10
) {
  const topLeftX = (width - 1) / -2;
  const topLeftZ = (height - 1) / 2;

  const inc = levelOfDetail === 0 ? 1 : levelOfDetail * 2;
  const vpl = (width - 1) / inc + 1; // vertices per line

  const skirtDepth = Math.max(0.2, inc * 0.2);

  const mainVertCount = vpl * vpl;
  const skirtVertCount = 4 * vpl;
  const mainIdxCount = (vpl - 1) * (vpl - 1) * 6;
  const skirtIdxCount = 4 * (vpl - 1) * 6;

  const meshData = new MeshData(mainVertCount + skirtVertCount, mainIdxCount + skirtIdxCount);
  let vi = 0;

  // ── Main mesh ────────────────────────────────────────────────────────────────
  for (let gy = 0; gy < vpl; gy++) {
    for (let gx = 0; gx < vpl; gx++) {
      const sx = gx * inc;
      const sy = gy * inc;
      meshData.setVertex(vi, topLeftX + sx, heightmap[sy * width + sx] * noiseScale, topLeftZ - sy, sx / (width - 1), sy / (height - 1));

      if (gx < vpl - 1 && gy < vpl - 1) {
        meshData.addTriangle(vi,           vi + vpl + 1, vi + vpl);
        meshData.addTriangle(vi + vpl + 1, vi,           vi + 1);
      }
      vi++;
    }
  }

  // Compute normals from main-mesh triangles only, before skirts are appended.
  // This prevents skirt faces from pulling edge vertex normals sideways.
  meshData.computeMainNormals(mainVertCount, mainIdxCount);

  // ── Skirts ───────────────────────────────────────────────────────────────────
  const rd = (gx: number, gy: number) => {
    const b = (gy * vpl + gx) * MESH_STRIDE;
    return { x: meshData.interleaved[b], y: meshData.interleaved[b + 1], z: meshData.interleaved[b + 2], u: meshData.interleaved[b + 3], v: meshData.interleaved[b + 4], idx: gy * vpl + gx };
  };

  // Add a skirt vertex and copy its normal from the corresponding edge vertex so
  // the skirt shades like a continuation of the terrain surface.
  const addSV = (edgeIdx: number, x: number, y: number, z: number, u: number, v: number) => {
    meshData.setVertex(vi, x, y, z, u, v);
    meshData.normals[vi * 3]     = meshData.normals[edgeIdx * 3];
    meshData.normals[vi * 3 + 1] = meshData.normals[edgeIdx * 3 + 1];
    meshData.normals[vi * 3 + 2] = meshData.normals[edgeIdx * 3 + 2];
    vi++;
  };

  const quad = (mA: number, mB: number, sA: number, sB: number, flip: boolean) => {
    if (!flip) { meshData.addTriangle(mA, sA, mB); meshData.addTriangle(mB, sA, sB); }
    else        { meshData.addTriangle(mA, mB, sA); meshData.addTriangle(mB, sB, sA); }
  };

  // Top edge    (gy = 0,      outward normal: +z, flip = false)
  const skirtTop = vi;
  for (let gx = 0; gx < vpl; gx++) { const p = rd(gx, 0);       addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v); }
  for (let gx = 0; gx < vpl - 1; gx++) quad(gx, gx + 1, skirtTop + gx, skirtTop + gx + 1, false);

  // Bottom edge (gy = vpl-1,  outward normal: -z, flip = true)
  const skirtBot = vi;
  for (let gx = 0; gx < vpl; gx++) { const p = rd(gx, vpl - 1); addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v); }
  for (let gx = 0; gx < vpl - 1; gx++) {
    const mA = (vpl - 1) * vpl + gx;
    quad(mA, mA + 1, skirtBot + gx, skirtBot + gx + 1, true);
  }

  // Left edge   (gx = 0,      outward normal: -x, flip = true)
  const skirtLeft = vi;
  for (let gy = 0; gy < vpl; gy++) { const p = rd(0, gy);        addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v); }
  for (let gy = 0; gy < vpl - 1; gy++) {
    const mA = gy * vpl;
    quad(mA, mA + vpl, skirtLeft + gy, skirtLeft + gy + 1, true);
  }

  // Right edge  (gx = vpl-1,  outward normal: +x, flip = false)
  const skirtRight = vi;
  for (let gy = 0; gy < vpl; gy++) { const p = rd(vpl - 1, gy);  addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v); }
  for (let gy = 0; gy < vpl - 1; gy++) {
    const mA = gy * vpl + (vpl - 1);
    quad(mA, mA + vpl, skirtRight + gy, skirtRight + gy + 1, false);
  }

  return meshData;
}
