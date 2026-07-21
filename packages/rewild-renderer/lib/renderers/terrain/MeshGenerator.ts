// Interleaved layout per vertex: [x, y, z, u, v]
export const MESH_STRIDE = 5;

// World size of one heightfield sample step. The heightfield is always
// generated at one-sample-per-unit density and the noise is sampled in that
// same (sample) space, so chunks stay byte-identical and seam-free regardless
// of this value — it only stretches the *mesh* horizontally, so a chunk spans
// (samples-1) * this many world units with the same vertex/triangle count.
// 1 = the original 1 unit/sample scale; raise it to enlarge the world without
// spending more polys (at the cost of terrain detail per world unit).
export const TERRAIN_METERS_PER_SAMPLE = 2;

export class MeshData {
  interleaved: Float32Array;
  triangles: Uint32Array;
  normals: Float32Array;
  triangleIndex: number = 0;

  constructor(vertexCount: number, indexCount: number) {
    this.interleaved = new Float32Array(vertexCount * MESH_STRIDE);
    this.triangles = new Uint32Array(indexCount);
    this.normals = new Float32Array(vertexCount * 3);
  }

  setVertex(
    index: number,
    x: number,
    y: number,
    z: number,
    u: number,
    v: number
  ) {
    const base = index * MESH_STRIDE;
    this.interleaved[base] = x;
    this.interleaved[base + 1] = y;
    this.interleaved[base + 2] = z;
    this.interleaved[base + 3] = u;
    this.interleaved[base + 4] = v;
  }

  addTriangle(a: number, b: number, c: number) {
    this.triangles[this.triangleIndex] = a;
    this.triangles[this.triangleIndex + 1] = b;
    this.triangles[this.triangleIndex + 2] = c;
    this.triangleIndex += 3;
  }

}

export function generateTerrainMesh(
  heightmap: Float32Array,
  width: number,
  height: number,
  levelOfDetail: number,
  noiseScale: number = 10,
  // Horizontal world scale per sample step. Only the mesh vertex x/z are
  // stretched by this — heights, UVs, normals topology and the sample grid are
  // untouched, so seam continuity is preserved (see TERRAIN_METERS_PER_SAMPLE).
  horizontalScale: number = 1,
  // Apron ring width around the chunk. When ≥ 1, `heightmap` is
  // (width+2·margin)² with the chunk's own samples in the centre and one (or
  // more) rings of neighbour heights around it, so edge-vertex normals get a
  // two-sided gradient and match the adjacent chunk (no lighting seam). At 0,
  // `heightmap` is the bare width×height chunk and edge normals fall back to a
  // one-sided difference.
  apronMargin: number = 0
) {
  const topLeftX = (width - 1) / -2;
  const topLeftZ = (height - 1) / 2;
  // Stride of the (possibly aproned) heightmap. Inner sample (sx, sy) lives at
  // ((sy+margin)·apronW + (sx+margin)); a ±1 neighbour is one index away.
  const apronW = width + 2 * apronMargin;
  const apronH = height + 2 * apronMargin;

  const inc = levelOfDetail === 0 ? 1 : levelOfDetail * 2;
  const vpl = (width - 1) / inc + 1; // vertices per line

  const skirtDepth = Math.max(0.2, inc * 0.2);

  const mainVertCount = vpl * vpl;
  const skirtVertCount = 4 * vpl;
  const mainIdxCount = (vpl - 1) * (vpl - 1) * 6;
  const skirtIdxCount = 4 * (vpl - 1) * 6;

  const meshData = new MeshData(
    mainVertCount + skirtVertCount,
    mainIdxCount + skirtIdxCount
  );
  let vi = 0;

  // ── Main mesh ────────────────────────────────────────────────────────────────
  for (let gy = 0; gy < vpl; gy++) {
    for (let gx = 0; gx < vpl; gx++) {
      const sx = gx * inc;
      const sy = gy * inc;
      meshData.setVertex(
        vi,
        (topLeftX + sx) * horizontalScale,
        heightmap[(sy + apronMargin) * apronW + (sx + apronMargin)] * noiseScale,
        (topLeftZ - sy) * horizontalScale,
        sx / (width - 1),
        sy / (height - 1)
      );

      if (gx < vpl - 1 && gy < vpl - 1) {
        meshData.addTriangle(vi, vi + vpl + 1, vi + vpl);
        meshData.addTriangle(vi + vpl + 1, vi, vi + 1);
      }
      vi++;
    }
  }

  // ── Vertex normals from the height gradient ──────────────────────────────────
  // Shade every LOD from the full-resolution surface gradient (central
  // difference of the ±1-sample neighbours), not from this LOD's coarse triangle
  // facets. The gradient at a world position is the same whichever chunk or LOD
  // samples it, so adjacent chunks — and adjacent LODs — agree on their shared
  // edge normals: no lighting seam, and coarse distant chunks shade smoothly
  // instead of faceted. With an apron (apronMargin ≥ 1) edge vertices get a
  // real two-sided difference from the neighbour ring; without one they clamp to
  // a one-sided difference at the outer edge. Runs before skirts are appended;
  // skirt vertices copy their edge vertex's normal (addSV).
  for (let gy = 0; gy < vpl; gy++) {
    for (let gx = 0; gx < vpl; gx++) {
      const sx = gx * inc + apronMargin;
      const sy = gy * inc + apronMargin;
      const xl = sx - 1 < 0 ? 0 : sx - 1;
      const xr = sx + 1 >= apronW ? apronW - 1 : sx + 1;
      const yd = sy - 1 < 0 ? 0 : sy - 1;
      const yu = sy + 1 >= apronH ? apronH - 1 : sy + 1;
      const row = sy * apronW;
      // +sx is +X and +sy is −Z (see vertex placement). ny carries the
      // horizontal sample spacing (horizontalScale) so the slope — hence the
      // tilt of the normal — stays correct at any world scale.
      const nx = (heightmap[row + xl] - heightmap[row + xr]) * noiseScale;
      const nz = (heightmap[yu * apronW + sx] - heightmap[yd * apronW + sx]) * noiseScale;
      const ny = 2 * horizontalScale;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const o = (gy * vpl + gx) * 3;
      if (len > 0) {
        meshData.normals[o] = nx / len;
        meshData.normals[o + 1] = ny / len;
        meshData.normals[o + 2] = nz / len;
      } else {
        meshData.normals[o] = 0;
        meshData.normals[o + 1] = 1;
        meshData.normals[o + 2] = 0;
      }
    }
  }

  // ── Skirts ───────────────────────────────────────────────────────────────────
  const rd = (gx: number, gy: number) => {
    const b = (gy * vpl + gx) * MESH_STRIDE;
    return {
      x: meshData.interleaved[b],
      y: meshData.interleaved[b + 1],
      z: meshData.interleaved[b + 2],
      u: meshData.interleaved[b + 3],
      v: meshData.interleaved[b + 4],
      idx: gy * vpl + gx,
    };
  };

  // Add a skirt vertex and copy its normal from the corresponding edge vertex so
  // the skirt shades like a continuation of the terrain surface.
  const addSV = (
    edgeIdx: number,
    x: number,
    y: number,
    z: number,
    u: number,
    v: number
  ) => {
    meshData.setVertex(vi, x, y, z, u, v);
    meshData.normals[vi * 3] = meshData.normals[edgeIdx * 3];
    meshData.normals[vi * 3 + 1] = meshData.normals[edgeIdx * 3 + 1];
    meshData.normals[vi * 3 + 2] = meshData.normals[edgeIdx * 3 + 2];
    vi++;
  };

  const quad = (
    mA: number,
    mB: number,
    sA: number,
    sB: number,
    flip: boolean
  ) => {
    if (!flip) {
      meshData.addTriangle(mA, sA, mB);
      meshData.addTriangle(mB, sA, sB);
    } else {
      meshData.addTriangle(mA, mB, sA);
      meshData.addTriangle(mB, sB, sA);
    }
  };

  // Top edge    (gy = 0,      outward normal: +z, flip = false)
  const skirtTop = vi;
  for (let gx = 0; gx < vpl; gx++) {
    const p = rd(gx, 0);
    addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v);
  }
  for (let gx = 0; gx < vpl - 1; gx++)
    quad(gx, gx + 1, skirtTop + gx, skirtTop + gx + 1, false);

  // Bottom edge (gy = vpl-1,  outward normal: -z, flip = true)
  const skirtBot = vi;
  for (let gx = 0; gx < vpl; gx++) {
    const p = rd(gx, vpl - 1);
    addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v);
  }
  for (let gx = 0; gx < vpl - 1; gx++) {
    const mA = (vpl - 1) * vpl + gx;
    quad(mA, mA + 1, skirtBot + gx, skirtBot + gx + 1, true);
  }

  // Left edge   (gx = 0,      outward normal: -x, flip = true)
  const skirtLeft = vi;
  for (let gy = 0; gy < vpl; gy++) {
    const p = rd(0, gy);
    addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v);
  }
  for (let gy = 0; gy < vpl - 1; gy++) {
    const mA = gy * vpl;
    quad(mA, mA + vpl, skirtLeft + gy, skirtLeft + gy + 1, true);
  }

  // Right edge  (gx = vpl-1,  outward normal: +x, flip = false)
  const skirtRight = vi;
  for (let gy = 0; gy < vpl; gy++) {
    const p = rd(vpl - 1, gy);
    addSV(p.idx, p.x, p.y - skirtDepth, p.z, p.u, p.v);
  }
  for (let gy = 0; gy < vpl - 1; gy++) {
    const mA = gy * vpl + (vpl - 1);
    quad(mA, mA + vpl, skirtRight + gy, skirtRight + gy + 1, false);
  }

  return meshData;
}
