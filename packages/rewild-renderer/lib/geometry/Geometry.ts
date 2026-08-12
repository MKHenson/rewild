import {
  Box3,
  Matrix3,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
} from 'rewild-common';
import { Transform } from '../core/Transform';
import { BVH } from '../acceleration/BVH';
import { BVHOptions } from '../acceleration/BVHNode';
import { BVHConfig } from '../acceleration/BVHConfig';
import { BVHWorkerManager } from '../acceleration/BVHWorkerManager';

export class GeometryGroup {
  public start: i32;
  public count: i32;
  public materialIndex: i32;
}

const _vector: Vector3 = new Vector3();
const _box = new Box3();
const _offset = new Vector3();
const _m1 = new Matrix4();
const _obj = new Transform();

export class Geometry {
  requiresBuild: boolean = true;
  vertices: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  uvs1?: Float32Array;
  colors?: Float32Array;
  /**
   * glTF's TANGENT: four floats per vertex — a unit tangent in xyz and a
   * handedness of +1 or -1 in w, which says which way the bitangent runs and so
   * survives mirrored UVs. Only a normal-mapped material reads it, and only
   * with `vertexTangents` set on the pass.
   */
  tangents?: Float32Array;
  groups: GeometryGroup[];

  vertexBuffer: GPUBuffer;
  normalBuffer: GPUBuffer;
  uvBuffer: GPUBuffer;
  uv1Buffer: GPUBuffer;
  colorBuffer: GPUBuffer;
  tangentBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  boundingBox: Box3 | null;
  boundingSphere: Sphere | null;
  drawRange = { start: 0, count: Infinity };

  bvh: BVH | null;
  bvhNeedsUpdate: boolean;
  /**
   * When false, build() never auto-computes a BVH for this geometry — the
   * owner manages the BVH itself (or deliberately goes without one and
   * relies on brute-force raycasting). Terrain uses this to keep trees off
   * far LOD meshes.
   */
  autoComputeBVH = true;
  // Set by dispose(); lets the async BVH path drop results that complete
  // after the geometry was replaced (otherwise every superseded terrain
  // re-mesh would materialize a full node tree on a dead geometry).
  private isDisposed = false;

  constructor() {
    this.groups = [];
    this.requiresBuild = true;
    this.boundingBox = null;
    this.boundingSphere = null;
    this.bvh = null;
    this.bvhNeedsUpdate = false;
  }

  dispose() {
    this.isDisposed = true;
    this.unloadBuffers();
    this.disposeBVH();
  }

  /**
   * Releases the GPU buffers only, keeping CPU-side arrays and the BVH.
   * For temporary unloads (e.g. terrain LOD caching) where the geometry
   * will be re-uploaded unchanged — build() then skips BVH construction
   * because the tree is still valid for the same vertices. Rebuilding it
   * on every unload/re-upload cycle churns hundreds of thousands of BVH
   * nodes just from the camera moving across LOD/view-distance rings.
   */
  unloadBuffers() {
    this.vertexBuffer?.destroy();
    this.normalBuffer?.destroy();
    this.uvBuffer?.destroy();
    this.colorBuffer?.destroy();
    this.tangentBuffer?.destroy();
    this.indexBuffer?.destroy();
  }

  computeBVH(options?: Partial<BVHOptions>): void {
    this.bvh = new BVH(this, options);
    this.bvhNeedsUpdate = false;
  }

  /**
   * Build a BVH asynchronously using a Web Worker for large geometries.
   * Falls back to synchronous build if the geometry is below the async
   * threshold. The returned promise resolves when the BVH is ready.
   *
   * While the worker is running, `this.bvh` is set but `bvh.isReady`
   * is false — raycasting will fall back to brute-force until complete.
   */
  async computeBVHAsync(
    workerManager: BVHWorkerManager,
    options?: Partial<BVHOptions>,
    asyncThreshold: i32 = 10000
  ): Promise<void> {
    const bvh = await BVH.buildAsync(
      this,
      workerManager,
      options,
      asyncThreshold
    );
    // The geometry was disposed while the worker ran (e.g. its mesh was
    // superseded by a sculpt re-mesh) — discard the stale tree.
    if (this.isDisposed) return;
    this.bvh = bvh;
    this.bvhNeedsUpdate = false;
  }

  disposeBVH(): void {
    this.bvh = null;
  }

  applyMatrix4(matrix: Matrix4): Geometry {
    const verts = this.vertices;
    const normals = this.normals;
    const tangents = this.tangents;

    for (let i = 0, l = verts.length; i < l; i += 3) {
      _vector.x = verts[i];
      _vector.y = verts[i + 1];
      _vector.z = verts[i + 2];
      _vector.applyMatrix4(matrix);

      verts[i] = _vector.x;
      verts[i + 1] = _vector.y;
      verts[i + 2] = _vector.z;
    }

    if (normals) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);

      for (let i = 0, l = verts.length; i < l; i += 3) {
        _vector.x = normals[i];
        _vector.y = normals[i + 1];
        _vector.z = normals[i + 2];

        _vector.applyNormalMatrix(normalMatrix);
        normals[i] = _vector.x;
        normals[i + 1] = _vector.y;
        normals[i + 2] = _vector.z;
      }
    }

    if (tangents) {
      // A mirroring matrix swaps which way round the bitangent runs, and the
      // bitangent is not stored — w is. So the handedness flips with the
      // determinant's sign, and nothing else in the frame has to change.
      const handedness: f32 = matrix.determinant() < 0 ? -1 : 1;

      // Four floats per vertex, not three: the loop walks tangents rather than
      // verts because the two arrays have different strides.
      for (let i = 0, l = tangents.length; i < l; i += 4) {
        _vector.x = tangents[i];
        _vector.y = tangents[i + 1];
        _vector.z = tangents[i + 2];

        _vector.transformDirection(matrix);
        tangents[i] = _vector.x;
        tangents[i + 1] = _vector.y;
        tangents[i + 2] = _vector.z;
        tangents[i + 3] *= handedness;
      }
    }

    if (this.boundingBox != null) {
      this.computeBoundingBox();
    }

    if (this.boundingSphere != null) {
      this.computeBoundingSphere();
    }

    return this;
  }

  computeBoundingBox(): void {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }

    const verts = this.vertices;

    if (!verts) {
      console.error(
        'Geometry.computeBoundingBox(): requires vertices. Alternatively set "mesh.frustumCulled" to "false".'
      );

      this.boundingBox!.set(
        new Vector3(-Infinity, -Infinity, -Infinity),
        new Vector3(+Infinity, +Infinity, +Infinity)
      );

      return;
    }

    if (verts != null) {
      this.boundingBox.setFromF32Array(verts);
    } else {
      this.boundingBox!.makeEmpty();
    }

    if (
      isNaN(this.boundingBox!.min.x) ||
      isNaN(this.boundingBox!.min.y) ||
      isNaN(this.boundingBox!.min.z)
    ) {
      throw new Error(
        'Geometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.'
      );
    }
  }

  computeBoundingSphere(): void {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }

    const verts = this.vertices;

    if (!verts) {
      console.error(
        'Geometry.computeBoundingSphere(): requires a manual verts. Alternatively set "mesh.frustumCulled" to "false".'
      );
      this.boundingSphere!.set(new Vector3(), Infinity);
      return;
    }

    if (verts) {
      // first, find the center of the bounding sphere

      const center = this.boundingSphere!.center;

      _box.setFromF32Array(verts);

      _box.getCenter(center);

      // second, try to find a boundingSphere with a radius smaller than the
      // boundingSphere of the boundingBox: sqrt(3) smaller in the best case

      let maxRadiusSq: f32 = 0;

      for (let i: u32 = 0, il = verts.length; i < il; i += 3) {
        _vector.x = verts[i];
        _vector.y = verts[i + 1];
        _vector.z = verts[i + 2];

        maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector));
      }

      this.boundingSphere!.radius = Math.sqrt(maxRadiusSq);

      if (isNaN(this.boundingSphere!.radius)) {
        throw new Error(
          'Geometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.'
        );
      }
    }
  }

  applyQuaternion(q: Quaternion): Geometry {
    _m1.makeRotationFromQuaternion(q);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateX(angle: f32): Geometry {
    // rotate geometry around world x-axis

    _m1.makeRotationX(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateY(angle: f32): Geometry {
    // rotate geometry around world y-axis

    _m1.makeRotationY(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateZ(angle: f32): Geometry {
    // rotate geometry around world z-axis

    _m1.makeRotationZ(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  translate(x: f32, y: f32, z: f32): Geometry {
    // translate geometry

    _m1.makeTranslation(x, y, z);

    this.applyMatrix4(_m1);

    return this;
  }

  scale(x: f32, y: f32, z: f32): Geometry {
    // scale geometry

    _m1.makeScale(x, y, z);

    this.applyMatrix4(_m1);

    return this;
  }

  lookAt(vector: Vector3): Geometry {
    _obj.lookAt(vector.x, vector.y, vector.z, false);

    _obj.updateMatrix();

    this.applyMatrix4(_obj.matrix);

    return this;
  }

  center(): Geometry {
    this.computeBoundingBox();

    this.boundingBox!.getCenter(_offset).negate();

    this.translate(_offset.x, _offset.y, _offset.z);

    return this;
  }

  build(
    device: GPUDevice,
    bvhConfig?: BVHConfig,
    workerManager?: BVHWorkerManager
  ) {
    // A geometry can be rebuilt after dispose (LOD re-upload) — it is live
    // again from here on.
    this.isDisposed = false;
    this.vertexBuffer = device.createBuffer({
      size: this.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(this.vertices);
    this.vertexBuffer.unmap();

    if (this.normals) {
      this.normalBuffer = device.createBuffer({
        label: 'normal buffer data',
        size: this.normals.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.normalBuffer.getMappedRange()).set(this.normals);
      this.normalBuffer.unmap();
    }

    if (this.uvs) {
      this.uvBuffer = device.createBuffer({
        label: 'uv buffer data',
        size: this.uvs.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.uvBuffer.getMappedRange()).set(this.uvs);
      this.uvBuffer.unmap();
    }

    if (this.uvs1) {
      this.uv1Buffer = device.createBuffer({
        label: 'uv1 buffer data',
        size: this.uvs1.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.uvBuffer.getMappedRange()).set(this.uvs1);
      this.uvBuffer.unmap();
    }

    if (this.colors) {
      this.colorBuffer = device.createBuffer({
        label: 'color buffer data',
        size: this.colors.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.colorBuffer.getMappedRange()).set(this.colors);
      this.colorBuffer.unmap();
    }

    if (this.tangents) {
      this.tangentBuffer = device.createBuffer({
        label: 'tangent buffer data',
        size: this.tangents.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });
      new Float32Array(this.tangentBuffer.getMappedRange()).set(this.tangents);
      this.tangentBuffer.unmap();
    }

    if (this.indices) {
      this.indexBuffer = device.createBuffer({
        label: 'index buffer data',
        size: this.indices.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
      });
      new Uint32Array(this.indexBuffer.getMappedRange()).set(this.indices);
      this.indexBuffer.unmap();
    }

    this.requiresBuild = false;

    // Auto-compute BVH if enabled and geometry exceeds threshold.
    if (bvhConfig?.autoComputeGeometryBVH && this.autoComputeBVH && !this.bvh) {
      const triCount = this.getTriangleCount();
      if (triCount >= bvhConfig.autoComputeThreshold) {
        const options: Partial<BVHOptions> = {
          strategy: bvhConfig.geometryBVHStrategy,
          maxDepth: bvhConfig.geometryBVHMaxDepth,
          maxLeafTriangles: bvhConfig.geometryBVHMaxLeafTriangles,
        };

        if (workerManager && triCount >= bvhConfig.asyncBuildThreshold) {
          // Large geometry — build in worker (fire-and-forget).
          this.computeBVHAsync(
            workerManager,
            options,
            bvhConfig.asyncBuildThreshold
          );
        } else {
          // Small/medium geometry — build synchronously.
          this.computeBVH(options);
        }
      }
    }
  }

  /** Return the number of triangles in this geometry. */
  getTriangleCount(): i32 {
    if (this.indices) {
      return (this.indices.length / 3) | 0;
    }
    return (this.vertices.length / 3 / 3) | 0;
  }

  setFromPoints(points: Vector3[]): Geometry {
    const position: f32[] = [];

    for (let i = 0, l = points.length; i < l; i++) {
      const point = points[i];
      position.push(point.x);
      position.push(point.y);
      position.push(point.z);
    }

    this.vertices = new Float32Array(position);
    return this;
  }

  getGPUVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return [
      {
        arrayStride: 3 * 4,
        stepMode: 'vertex',
        attributes: [
          {
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
          },
        ],
      },
    ];
  }

  normalizeNormals(): void {
    const normals = this.normals;
    if (!normals) return;

    for (let i = 0; i < normals.length; i += 3) {
      _vector.set(normals[i], normals[i + 1], normals[i + 2]);
      _vector.normalize();
      normals[i] = _vector.x;
      normals[i + 1] = _vector.y;
      normals[i + 2] = _vector.z;
    }
  }

  computeNormals(): void {
    const indices = this.indices;
    const vertices = this.vertices;

    if (vertices) {
      if (!this.normals) {
        this.normals = new Float32Array(vertices.length);
      } else {
        this.normals.fill(0);
      }

      const pA = new Vector3();
      const pB = new Vector3();
      const pC = new Vector3();
      const nA = new Vector3();
      const nB = new Vector3();
      const nC = new Vector3();
      const cB = new Vector3();
      const aB = new Vector3();

      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          const vA = indices[i];
          const vB = indices[i + 1];
          const vC = indices[i + 2];

          pA.fromBuffer(vA * 3, vertices);
          pB.fromBuffer(vB * 3, vertices);
          pC.fromBuffer(vC * 3, vertices);

          cB.subVectors(pC, pB);
          aB.subVectors(pA, pB);
          cB.cross(aB);

          nA.fromBuffer(vA * 3, this.normals);
          nB.fromBuffer(vB * 3, this.normals);
          nC.fromBuffer(vC * 3, this.normals);

          nA.add(cB);
          nB.add(cB);
          nC.add(cB);

          this.normals.set([nA.x, nA.y, nA.z], vA * 3);
          this.normals.set([nB.x, nB.y, nB.z], vB * 3);
          this.normals.set([nC.x, nC.y, nC.z], vC * 3);
        }
      } else {
        for (let i = 0; i < vertices.length; i += 9) {
          pA.fromBuffer(i, vertices);
          pB.fromBuffer(i + 3, vertices);
          pC.fromBuffer(i + 6, vertices);

          cB.subVectors(pC, pB);
          aB.subVectors(pA, pB);
          cB.cross(aB);

          this.normals.set([cB.x, cB.y, cB.z], i);
          this.normals.set([cB.x, cB.y, cB.z], i + 3);
          this.normals.set([cB.x, cB.y, cB.z], i + 6);
        }
      }
    }

    this.normalizeNormals();
    this.requiresBuild = true;
  }

  /**
   * Derives a tangent frame from the UV parameterization, for geometry whose
   * source did not ship one. A normal map is authored in tangent space, so
   * without a tangent the only frame a shader can reconstruct is one from
   * screen-space derivatives — which is an approximation of *this*, and gets
   * mirrored UVs and hard UV seams wrong.
   *
   * Per triangle, the UV gradient gives the direction in object space that U
   * increases along; accumulating that at each vertex and orthogonalizing
   * against the normal yields the same frame a baker used, to within the
   * smoothing that averaging introduces. Handedness comes from whether the V
   * gradient agrees with N × T — negative wherever the UVs are mirrored.
   *
   * Requires normals and UVs. Call it after computeNormals(), and again if the
   * normals change: the frame is orthogonalized against them.
   */
  computeTangents(): void {
    const { vertices, uvs, normals, indices } = this;

    if (!vertices || !uvs || !normals) {
      console.error(
        'Geometry.computeTangents(): requires vertices, uvs and normals.'
      );
      return;
    }

    const vertexCount = (vertices.length / 3) | 0;

    if (!this.tangents || this.tangents.length !== vertexCount * 4)
      this.tangents = new Float32Array(vertexCount * 4);

    // U and V gradients, accumulated per vertex over every triangle using it.
    // Scalar arrays rather than Vector3s: this runs over every triangle of
    // every imported model, and the whole loop below allocates nothing.
    const uDir = new Float32Array(vertexCount * 3);
    const vDir = new Float32Array(vertexCount * 3);
    const triangleCount = ((indices ? indices.length : vertexCount) / 3) | 0;

    for (let t = 0; t < triangleCount; t++) {
      const a = indices ? indices[t * 3] : t * 3;
      const b = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const c = indices ? indices[t * 3 + 2] : t * 3 + 2;

      const x1 = vertices[b * 3] - vertices[a * 3];
      const y1 = vertices[b * 3 + 1] - vertices[a * 3 + 1];
      const z1 = vertices[b * 3 + 2] - vertices[a * 3 + 2];
      const x2 = vertices[c * 3] - vertices[a * 3];
      const y2 = vertices[c * 3 + 1] - vertices[a * 3 + 1];
      const z2 = vertices[c * 3 + 2] - vertices[a * 3 + 2];

      const s1 = uvs[b * 2] - uvs[a * 2];
      const t1 = uvs[b * 2 + 1] - uvs[a * 2 + 1];
      const s2 = uvs[c * 2] - uvs[a * 2];
      const t2 = uvs[c * 2 + 1] - uvs[a * 2 + 1];

      // Zero area in UV space — the triangle carries no information about which
      // way U runs, so it contributes nothing rather than a division by zero.
      const det = s1 * t2 - s2 * t1;
      if (det === 0) continue;
      const r = 1 / det;

      const udx = (t2 * x1 - t1 * x2) * r;
      const udy = (t2 * y1 - t1 * y2) * r;
      const udz = (t2 * z1 - t1 * z2) * r;
      const vdx = (s1 * x2 - s2 * x1) * r;
      const vdy = (s1 * y2 - s2 * y1) * r;
      const vdz = (s1 * z2 - s2 * z1) * r;

      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c;
        uDir[v * 3] += udx;
        uDir[v * 3 + 1] += udy;
        uDir[v * 3 + 2] += udz;
        vDir[v * 3] += vdx;
        vDir[v * 3 + 1] += vdy;
        vDir[v * 3 + 2] += vdz;
      }
    }

    const tangents = this.tangents;

    for (let v = 0; v < vertexCount; v++) {
      const nx = normals[v * 3];
      const ny = normals[v * 3 + 1];
      const nz = normals[v * 3 + 2];
      const ux = uDir[v * 3];
      const uy = uDir[v * 3 + 1];
      const uz = uDir[v * 3 + 2];

      // Gram-Schmidt: the accumulated gradient is only perpendicular to the
      // normal on a flat, evenly mapped surface, and the shader's frame has to
      // be orthonormal to invert.
      const dot = nx * ux + ny * uy + nz * uz;
      let tx = ux - nx * dot;
      let ty = uy - ny * dot;
      let tz = uz - nz * dot;
      const length = Math.sqrt(tx * tx + ty * ty + tz * tz);

      if (length > 1e-8) {
        tx /= length;
        ty /= length;
        tz /= length;
      } else {
        // No usable gradient — a vertex only degenerate triangles touch, or one
        // whose gradient came out parallel to its normal. Any perpendicular
        // will do: the normal map will be read in an arbitrarily rotated frame,
        // which is wrong but bounded, where a zero tangent is a NaN normal and
        // a black hole in the shading.
        const ax = Math.abs(nx) < 0.9 ? 1 : 0;
        const ay = ax === 1 ? 0 : 1;
        tx = ny * 0 - nz * ay;
        ty = nz * ax - nx * 0;
        tz = nx * ay - ny * ax;
        const fallbackLength = Math.sqrt(tx * tx + ty * ty + tz * tz);
        tx /= fallbackLength;
        ty /= fallbackLength;
        tz /= fallbackLength;
      }

      // (N × T) is where the bitangent should point for right-handed UVs;
      // disagreeing with the actual V gradient means they are mirrored.
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;
      const agrees =
        bx * vDir[v * 3] + by * vDir[v * 3 + 1] + bz * vDir[v * 3 + 2];

      tangents[v * 4] = tx;
      tangents[v * 4 + 1] = ty;
      tangents[v * 4 + 2] = tz;
      tangents[v * 4 + 3] = agrees < 0 ? -1 : 1;
    }

    this.requiresBuild = true;
  }
}
