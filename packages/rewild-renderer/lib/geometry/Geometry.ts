import {
  Box3,
  Matrix3,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
} from 'rewild-common';
import { Transform } from '../core/Transform';

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
  indices?: Uint16Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  groups: GeometryGroup[];

  _todoTangents: Float32Array;

  vertexBuffer: GPUBuffer;
  normalBuffer: GPUBuffer;
  uvBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  boundingBox: Box3 | null;
  boundingSphere: Sphere | null;

  constructor() {
    this.groups = [];
    this.requiresBuild = true;
    this.boundingBox = null;
    this.boundingSphere = null;
  }

  dispose() {
    this.vertexBuffer?.destroy();
    this.normalBuffer?.destroy();
    this.uvBuffer?.destroy();
    this.indexBuffer?.destroy();
  }

  applyMatrix4(matrix: Matrix4): Geometry {
    const verts = this.vertices;
    const normals = this.normals;
    const tangents = this._todoTangents;

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
      for (let i = 0, l = verts.length; i < l; i += 3) {
        _vector.x = tangents[i];
        _vector.y = tangents[i + 1];
        _vector.z = tangents[i + 2];

        _vector.transformDirection(matrix);
        tangents[i] = _vector.x;
        tangents[i + 1] = _vector.y;
        tangents[i + 2] = _vector.z;
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

        maxRadiusSq = Mathf.max(maxRadiusSq, center.distanceToSquared(_vector));
      }

      this.boundingSphere!.radius = Mathf.sqrt(maxRadiusSq);

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

  build(device: GPUDevice) {
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

    if (this.indices) {
      this.indexBuffer = device.createBuffer({
        label: 'index buffer data',
        size: this.indices.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
      });
      new Uint16Array(this.indexBuffer.getMappedRange()).set(this.indices);
      this.indexBuffer.unmap();
    }

    this.requiresBuild = false;
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
}
