import { EngineVector3 } from "../math/Vector3";
import { EngineVector2 } from "../math/Vector2";
import { EngineBox3 } from "../math/Box3";
import {
  BaseAttribute,
  BufferAttribute,
  CloneToken,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from "./BufferAttribute";
import {
  Sphere,
  Matrix3,
  generateUUID,
  Quaternion,
  AttributeType,
  Vector3,
  Event,
  EventDispatcher,
} from "rewild-common";
import { TransformNode } from "./TransformNode";
import { EngineMatrix4 } from "../math/Matrix4";
import { ASError } from "./Error";
import { GLBufferAttribute } from "./GLBufferAttribute";
import { toTypedArray } from "../utils";
import { BridgeManager } from "../core/BridgeManager";

let _id = 0;

const _m1 = new EngineMatrix4();
const _obj = new TransformNode();
const _offset = new EngineVector3();
const _box = new EngineBox3();
const _boxMorphTargets = new EngineBox3();
const _vector = new EngineVector3();

export class BufferGeometryDrawRange {
  start: i32;
  count: i32;
  constructor() {
    this.start = 0;
    this.count = i32.MAX_VALUE;
  }
}

export class BufferGeometryGroup {
  start: i32;
  count: i32;
  materialIndex: i32;

  constructor(start: i32, count: i32, materialIndex: i32 = 0) {
    this.start = start;
    this.count = count;
    this.materialIndex = materialIndex;
  }
}

const disposeEvent: Event = new Event("disposed");

export class BufferGeometry extends EventDispatcher {
  uuid: string;

  name: string;
  type: string;

  indexes: Uint32BufferAttribute | null;
  attributes: Map<AttributeType, BaseAttribute>;

  morphAttributes: Map<AttributeType, BaseAttribute[]>;
  morphTargetsRelative: boolean;

  groups: BufferGeometryGroup[];

  boundingBox: EngineBox3 | null;
  boundingSphere: Sphere | null;

  drawRange: BufferGeometryDrawRange;
  readonly id: u32;

  // userData: {};

  constructor() {
    super();

    this.id = _id++;

    this.uuid = generateUUID();

    this.name = "";
    this.type = "BufferGeometry";

    this.indexes = null;
    this.attributes = new Map();

    this.morphAttributes = new Map();
    this.morphTargetsRelative = false;

    this.groups = [];

    this.boundingBox = null;
    this.boundingSphere = null;

    this.drawRange = new BufferGeometryDrawRange();

    // this.userData = {};
  }

  getIndexes(): Uint32BufferAttribute | null {
    return this.indexes;
  }

  setIndexes(indexes: u32[] | null): BufferGeometry {
    this.indexes = indexes
      ? new Uint32BufferAttribute(
          toTypedArray<u32, Uint32Array>(
            indexes,
            Uint32Array.BYTES_PER_ELEMENT
          ),
          1
        )
      : null;
    return this;
  }

  setIndexAttribute(index: Uint32BufferAttribute): BufferGeometry {
    this.indexes = index;
    return this;
  }
  // ==================

  getAttribute<K extends BaseAttribute>(name: AttributeType): K | null {
    if (this.hasAttribute(name)) return this.attributes.get(name) as K;
    else return null;
  }

  getMorphAttribute<K extends BaseAttribute>(name: AttributeType): K[] | null {
    if (this.hasMoprhAttribute(name)) {
      const toRet = this.morphAttributes.get(name);
      return changetype<K[]>(toRet);
    } else return null;
  }

  setAttribute(name: AttributeType, attribute: BaseAttribute): BufferGeometry {
    this.attributes.set(name, attribute);

    return this;
  }

  deleteAttribute(name: AttributeType): BufferGeometry {
    this.attributes.delete(name);

    return this;
  }

  hasAttribute(name: AttributeType): bool {
    return this.attributes.has(name);
  }

  hasMoprhAttribute(name: AttributeType): bool {
    return this.morphAttributes.has(name);
  }

  addGroup(start: i32, count: i32, materialIndex: i32 = 0): void {
    this.groups.push(new BufferGeometryGroup(start, count, materialIndex));
  }

  clearGroups(): void {
    this.groups = [];
  }

  setDrawRange(start: i32, count: i32): void {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }

  applyMatrix4(matrix: EngineMatrix4): BufferGeometry {
    const position = this.getAttribute<Float32BufferAttribute>(
      AttributeType.POSITION
    );

    if (position) {
      BufferAttribute.applyMatrix4(matrix, position);

      position.needsUpdate = true;
    }

    const normal = this.getAttribute<Float32BufferAttribute>(
      AttributeType.NORMAL
    );

    if (normal != null) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      BufferAttribute.applyNormalMatrix(normalMatrix, normal);
      normal.needsUpdate = true;
    }

    const tangent = this.getAttribute<Float32BufferAttribute>(
      AttributeType.TANGENT
    );

    if (tangent != null) {
      BufferAttribute.transformDirection(matrix, tangent);
      tangent.needsUpdate = true;
    }

    if (this.boundingBox != null) {
      this.computeBoundingBox();
    }

    if (this.boundingSphere != null) {
      this.computeBoundingSphere();
    }

    return this;
  }

  applyQuaternion(q: Quaternion): BufferGeometry {
    _m1.makeRotationFromQuaternion(q);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateX(angle: f32): BufferGeometry {
    // rotate geometry around world x-axis

    _m1.makeRotationX(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateY(angle: f32): BufferGeometry {
    // rotate geometry around world y-axis

    _m1.makeRotationY(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  rotateZ(angle: f32): BufferGeometry {
    // rotate geometry around world z-axis

    _m1.makeRotationZ(angle);

    this.applyMatrix4(_m1);

    return this;
  }

  translate(x: f32, y: f32, z: f32): BufferGeometry {
    // translate geometry

    _m1.makeTranslation(x, y, z);

    this.applyMatrix4(_m1);

    return this;
  }

  scale(x: f32, y: f32, z: f32): BufferGeometry {
    // scale geometry

    _m1.makeScale(x, y, z);

    this.applyMatrix4(_m1);

    return this;
  }

  lookAt(vector: EngineVector3): BufferGeometry {
    _obj.lookAt(vector.x, vector.y, vector.z);

    _obj.updateMatrix();

    this.applyMatrix4(_obj.matrix);

    return this;
  }

  center(): BufferGeometry {
    this.computeBoundingBox();

    this.boundingBox!.getCenter(_offset).negate();

    this.translate(_offset.x, _offset.y, _offset.z);

    return this;
  }

  setFromPoints(points: Vector3[]): BufferGeometry {
    const position: f32[] = [];

    for (let i = 0, l = points.length; i < l; i++) {
      const point = points[i];
      position.push(point.x);
      position.push(point.y);
      position.push(point.z);
    }

    this.setAttribute(
      AttributeType.POSITION,
      new Float32BufferAttribute(
        toTypedArray<f32, Float32Array>(
          position,
          Float32Array.BYTES_PER_ELEMENT
        ),
        3
      )
    );

    return this;
  }

  computeBoundingBox(): void {
    if (this.boundingBox === null) {
      this.boundingBox = new EngineBox3();
    }

    const position = this.getAttribute<Float32BufferAttribute>(
      AttributeType.POSITION
    );
    const morphAttributesPosition =
      this.getMorphAttribute<Float32BufferAttribute>(AttributeType.POSITION);

    if (position && position instanceof GLBufferAttribute) {
      BridgeManager.getBridge().print(
        'BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".'
      );

      this.boundingBox!.set(
        new EngineVector3(-Infinity, -Infinity, -Infinity),
        new EngineVector3(+Infinity, +Infinity, +Infinity)
      );

      return;
    }

    if (position != null) {
      this.boundingBox!.setFromBufferAttribute(position);

      // process morph attributes if present

      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _box.setFromBufferAttribute(morphAttribute);

          if (this.morphTargetsRelative) {
            _vector.addVectors(this.boundingBox!.min, _box.min);
            this.boundingBox!.expandByPoint(_vector);

            _vector.addVectors(this.boundingBox!.max, _box.max);
            this.boundingBox!.expandByPoint(_vector);
          } else {
            this.boundingBox!.expandByPoint(_box.min);
            this.boundingBox!.expandByPoint(_box.max);
          }
        }
      }
    } else {
      this.boundingBox!.makeEmpty();
    }

    if (
      isNaN(this.boundingBox!.min.x) ||
      isNaN(this.boundingBox!.min.y) ||
      isNaN(this.boundingBox!.min.z)
    ) {
      throw new ASError(
        'BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.'
      );
    }
  }

  computeBoundingSphere(): void {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }

    const position = this.getAttribute<Float32BufferAttribute>(
      AttributeType.POSITION
    );
    const morphAttributesPosition =
      this.getMorphAttribute<Float32BufferAttribute>(AttributeType.POSITION);

    if (position && position instanceof GLBufferAttribute) {
      BridgeManager.getBridge().print(
        'BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".'
      );
      this.boundingSphere!.set(new EngineVector3(), Infinity);
      return;
    }

    if (position) {
      // first, find the center of the bounding sphere

      const center = this.boundingSphere!.center;

      _box.setFromBufferAttribute(position);

      // process morph attributes if present

      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _boxMorphTargets.setFromBufferAttribute(morphAttribute);

          if (this.morphTargetsRelative) {
            _vector.addVectors(_box.min, _boxMorphTargets.min);
            _box.expandByPoint(_vector);

            _vector.addVectors(_box.max, _boxMorphTargets.max);
            _box.expandByPoint(_vector);
          } else {
            _box.expandByPoint(_boxMorphTargets.min);
            _box.expandByPoint(_boxMorphTargets.max);
          }
        }
      }

      _box.getCenter(center);

      // second, try to find a boundingSphere with a radius smaller than the
      // boundingSphere of the boundingBox: sqrt(3) smaller in the best case

      let maxRadiusSq: f32 = 0;

      for (let i: u32 = 0, il = position.count; i < il; i++) {
        _vector.fromBufferAttribute(position, i);

        maxRadiusSq = Mathf.max(maxRadiusSq, center.distanceToSquared(_vector));
      }

      // process morph attributes if present

      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          const morphTargetsRelative = this.morphTargetsRelative;

          for (let j: u32 = 0, jl = morphAttribute.count; j < jl; j++) {
            _vector.fromBufferAttribute(morphAttribute, j);

            if (morphTargetsRelative) {
              _offset.fromBufferAttribute(position, j);
              _vector.add(_offset);
            }

            maxRadiusSq = Mathf.max(
              maxRadiusSq,
              center.distanceToSquared(_vector)
            );
          }
        }
      }

      this.boundingSphere!.radius = Mathf.sqrt(maxRadiusSq);

      if (isNaN(this.boundingSphere!.radius)) {
        throw new ASError(
          'THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.'
        );
      }
    }
  }

  computeFaceNormals(): void {
    // backwards compatibility
  }

  computeTangents(): void {
    const index = this.indexes;
    const attributes = this.attributes;

    // based on http://www.terathon.com/code/tangent.html
    // (per vertex tangents)

    if (
      index === null ||
      !attributes.has(AttributeType.POSITION) ||
      !attributes.has(AttributeType.NORMAL) ||
      !attributes.has(AttributeType.UV)
    )
      throw new ASError(
        "BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)"
      );

    const indices = index.array;
    const positions = this.getAttribute<Float32BufferAttribute>(
      AttributeType.POSITION
    )!.array;
    const normals = this.getAttribute<Float32BufferAttribute>(
      AttributeType.NORMAL
    )!.array;
    const uvs = this.getAttribute<Float32BufferAttribute>(
      AttributeType.UV
    )!.array;

    const nVertices = positions.length / 3;

    if (!attributes.has(AttributeType.TANGENT)) {
      this.setAttribute(
        AttributeType.TANGENT,
        new Float32BufferAttribute(new Float32Array(4 * nVertices), 4)
      );
    }

    const tangents = this.getAttribute<Float32BufferAttribute>(
      AttributeType.TANGENT
    )!.array;

    const tan1: EngineVector3[] = [],
      tan2: EngineVector3[] = [];

    for (let i = 0; i < nVertices; i++) {
      tan1[i] = new EngineVector3();
      tan2[i] = new EngineVector3();
    }

    const vA = new EngineVector3(),
      vB = new EngineVector3(),
      vC = new EngineVector3(),
      uvA = new EngineVector2(),
      uvB = new EngineVector2(),
      uvC = new EngineVector2(),
      sdir = new EngineVector3(),
      tdir = new EngineVector3();

    function handleTriangle(a: f32, b: f32, c: f32) {
      vA.fromF32Array(positions, a * 3);
      vB.fromF32Array(positions, b * 3);
      vC.fromF32Array(positions, c * 3);

      uvA.fromArray(uvs, a * 2);
      uvB.fromArray(uvs, b * 2);
      uvC.fromArray(uvs, c * 2);

      vB.sub(vA);
      vC.sub(vA);

      uvB.sub(uvA);
      uvC.sub(uvA);

      const r = 1.0 / (uvB.x * uvC.y - uvC.x * uvB.y);

      // silently ignore degenerate uv triangles having coincident or colinear vertices

      if (!isFinite(r)) return;

      sdir
        .copy(vB)
        .multiplyScalar(uvC.y)
        .addScaledVector(vC, -uvB.y)
        .multiplyScalar(r);
      tdir
        .copy(vC)
        .multiplyScalar(uvB.x)
        .addScaledVector(vB, -uvC.x)
        .multiplyScalar(r);

      tan1[a].add(sdir);
      tan1[b].add(sdir);
      tan1[c].add(sdir);

      tan2[a].add(tdir);
      tan2[b].add(tdir);
      tan2[c].add(tdir);
    }

    let groups = this.groups;

    if (groups.length === 0) {
      groups = [new BufferGeometryGroup(0, indices.length)];
    }

    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];

      const start = group.start;
      const count = group.count;

      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleTriangle(indices[j + 0], indices[j + 1], indices[j + 2]);
      }
    }

    const tmp = new EngineVector3(),
      tmp2 = new EngineVector3();
    const n = new EngineVector3(),
      n2 = new EngineVector3();

    function handleVertex(v: u32) {
      n.fromF32Array(normals, v * 3);
      n2.copy(n);

      const t = tan1[v];

      // Gram-Schmidt orthogonalize

      tmp.copy(t);
      tmp.sub(n.multiplyScalar(n.dot(t))).normalize();

      // Calculate handedness

      tmp2.crossVectors(n2, t);
      const test = tmp2.dot(tan2[v]);
      const w = test < 0.0 ? -1.0 : 1.0;

      tangents[v * 4] = tmp.x;
      tangents[v * 4 + 1] = tmp.y;
      tangents[v * 4 + 2] = tmp.z;
      tangents[v * 4 + 3] = w;
    }

    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];

      const start = group.start;
      const count = group.count;

      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleVertex(indices[j + 0]);
        handleVertex(indices[j + 1]);
        handleVertex(indices[j + 2]);
      }
    }
  }

  computeVertexNormals(): void {
    const index = this.indexes;
    const positionAttribute = this.getAttribute<Float32BufferAttribute>(
      AttributeType.POSITION
    );

    if (positionAttribute != null) {
      let normalAttribute = this.getAttribute<Float32BufferAttribute>(
        AttributeType.NORMAL
      );

      if (normalAttribute === null) {
        normalAttribute = new BufferAttribute(
          new Float32Array(positionAttribute.count * 3),
          3
        );
        this.setAttribute(AttributeType.NORMAL, normalAttribute);
      } else {
        // reset existing normals to zero

        for (let i = 0, il = normalAttribute.count; i < il; i++) {
          normalAttribute.setXYZ(i, 0, 0, 0);
        }
      }

      const pA = new EngineVector3(),
        pB = new EngineVector3(),
        pC = new EngineVector3();
      const nA = new EngineVector3(),
        nB = new EngineVector3(),
        nC = new EngineVector3();
      const cb = new EngineVector3(),
        ab = new EngineVector3();

      // indexed elements

      if (index) {
        for (let i = 0, il = index.count; i < il; i += 3) {
          const vA = index.getX(i + 0);
          const vB = index.getX(i + 1);
          const vC = index.getX(i + 2);

          pA.fromBufferAttribute(positionAttribute, vA);
          pB.fromBufferAttribute(positionAttribute, vB);
          pC.fromBufferAttribute(positionAttribute, vC);

          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);

          nA.fromBufferAttribute(normalAttribute, vA);
          nB.fromBufferAttribute(normalAttribute, vB);
          nC.fromBufferAttribute(normalAttribute, vC);

          nA.add(cb);
          nB.add(cb);
          nC.add(cb);

          normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
          normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
          normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
        }
      } else {
        // non-indexed elements (unconnected triangle soup)

        for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
          pA.fromBufferAttribute(positionAttribute, i + 0);
          pB.fromBufferAttribute(positionAttribute, i + 1);
          pC.fromBufferAttribute(positionAttribute, i + 2);

          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);

          normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
        }
      }

      this.normalizeNormals();

      normalAttribute.needsUpdate = true;
    }
  }

  merge(geometry: BufferGeometry, offset: i32 = 0): BufferGeometry {
    const attributes = this.attributes;

    const keys = attributes.keys();
    for (let i: i32 = 0, l: i32 = keys.length; i < l; i++) {
      const key = keys[i];
      if (!geometry.attributes.has(key)) continue;

      const attribute1 = attributes.get(key);
      // const attributeArray1 = attribute1.array;

      const attribute2 = geometry.attributes.get(key);
      // const attributeArray2 = attribute2.array;

      attribute1.merge(attribute2, offset);

      // const attributeOffset = attribute2.itemSize * offset;
      // const length = Mathf.min(attributeArray2.length, attributeArray1.length - attributeOffset);

      // for (let i = 0, j = attributeOffset; i < length; i++, j++) {
      //   attributeArray1[j] = attributeArray2[i];
      // }
    }

    return this;
  }

  normalizeNormals(): void {
    const normals = this.getAttribute<Float32BufferAttribute>(
      AttributeType.NORMAL
    );
    if (!normals) throw new Error("No normal attribute defined");

    for (let i = 0, il = normals.count; i < il; i++) {
      _vector.fromBufferAttribute(normals, i);

      _vector.normalize();

      normals.setXYZ(i, _vector.x, _vector.y, _vector.z);
    }
  }

  toNonIndexed(): BufferGeometry {
    if (this.indexes === null) {
      return this;
    }

    const geometry2 = new BufferGeometry();

    const index = this.indexes;
    const indices = index.array;
    const attributes = this.attributes;

    // attributes

    const keys = attributes.keys();
    for (let i: i32 = 0, l: i32 = keys.length; i < l; i++) {
      const key = keys[i];
      const attribute = attributes.get(key);
      const newAttribute = attribute.convertBufferAttribute(indices);
      geometry2.setAttribute(key, newAttribute);
    }

    // morph attributes

    const morphAttributes = this.morphAttributes;
    const morphKeys = morphAttributes.keys();

    for (let i: i32 = 0, l: i32 = morphKeys.length; i < l; i++) {
      const morphKey = morphKeys[i];
      const morphArray: BaseAttribute[] = [];
      const morphAttribute = morphAttributes.get(morphKey); // morphAttribute: array of Float32BufferAttributes

      for (let i = 0, il = morphAttribute.length; i < il; i++) {
        const attribute = morphAttribute[i];
        const newAttribute = attribute.convertBufferAttribute(indices);
        morphArray.push(newAttribute);
      }

      geometry2.morphAttributes.set(morphKey, morphArray);
    }

    geometry2.morphTargetsRelative = this.morphTargetsRelative;

    // groups

    const groups = this.groups;

    for (let i: i32 = 0, l: i32 = groups.length; i < l; i++) {
      const group = groups[i];
      geometry2.addGroup(group.start, group.count, group.materialIndex);
    }

    return geometry2;
  }

  // toJSON() {
  //   const data = {
  //     metadata: {
  //       version: 4.5,
  //       type: "BufferGeometry",
  //       generator: "BufferGeometry.toJSON",
  //     },
  //   };

  //   // standard BufferGeometry serialization

  //   data.uuid = this.uuid;
  //   data.type = this.type;
  //   if (this.name != "") data.name = this.name;
  //   if (Object.keys(this.userData).length > 0) data.userData = this.userData;

  //   if (this.parameters != undefined) {
  //     const parameters = this.parameters;

  //     for (const key in parameters) {
  //       if (parameters[key] != undefined) data[key] = parameters[key];
  //     }

  //     return data;
  //   }

  //   // for simplicity the code assumes attributes are not shared across geometries, see #15811

  //   data.data = { attributes: {} };

  //   const index = this.index;

  //   if (index != null) {
  //     data.data.index = {
  //       type: index.array.constructor.name,
  //       array: Array.prototype.slice.call(index.array),
  //     };
  //   }

  //   const attributes = this.attributes;

  //   for (const key in attributes) {
  //     const attribute = attributes[key];

  //     data.data.attributes[key] = attribute.toJSON(data.data);
  //   }

  //   const morphAttributes = {};
  //   let hasMorphAttributes = false;

  //   for (const key in this.morphAttributes) {
  //     const attributeArray = this.morphAttributes[key];

  //     const array = [];

  //     for (let i = 0, il = attributeArray.length; i < il; i++) {
  //       const attribute = attributeArray[i];

  //       array.push(attribute.toJSON(data.data));
  //     }

  //     if (array.length > 0) {
  //       morphAttributes[key] = array;

  //       hasMorphAttributes = true;
  //     }
  //   }

  //   if (hasMorphAttributes) {
  //     data.data.morphAttributes = morphAttributes;
  //     data.data.morphTargetsRelative = this.morphTargetsRelative;
  //   }

  //   const groups = this.groups;

  //   if (groups.length > 0) {
  //     data.data.groups = JSON.parse(JSON.stringify(groups));
  //   }

  //   const boundingSphere = this.boundingSphere;

  //   if (boundingSphere != null) {
  //     data.data.boundingSphere = {
  //       center: boundingSphere.center.toArray(),
  //       radius: boundingSphere.radius,
  //     };
  //   }

  //   return data;
  // }

  clone(): BufferGeometry {
    /*
		 // Handle primitives
		 const parameters = this.parameters;
		 if ( parameters != undefined ) {
		 const values = [];
		 for ( const key in parameters ) {
		 values.push( parameters[ key ] );
		 }
		 const geometry = Object.create( this.constructor.prototype );
		 this.constructor.apply( geometry, values );
		 return geometry;
		 }
		 return new this.constructor().copy( this );
		 */

    return new BufferGeometry().copy(this);
  }

  copy(source: BufferGeometry): BufferGeometry {
    // reset

    this.indexes = null;
    this.attributes = new Map();
    this.morphAttributes = new Map();
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;

    // used for storing cloned, shared data

    const data: CloneToken = new CloneToken();

    // name

    this.name = source.name;

    // index

    const index = source.indexes
      ? new Uint32BufferAttribute(source.indexes.array.slice(0), 1)
      : null;

    // attributes

    const attributes = source.attributes;

    const keys = attributes.keys();
    for (let i: u8 = 0, l: u8 = keys.length; i < l; i++) {
      const key = keys[i];
      const attribute = attributes.get(key);
      this.setAttribute(key, attribute.clone(data));
    }

    // morph attributes

    const morphAttributes = source.morphAttributes;

    const morphKeys = morphAttributes.keys();
    for (let i: u8 = 0, l: u8 = morphKeys.length; i < l; i++) {
      const morphKey = morphKeys[i];
      const array = [];
      const morphAttribute = morphAttributes.get(morphKey); // morphAttribute: array of Float32BufferAttributes

      for (let i = 0, l = morphAttribute.length; i < l; i++) {
        array.push(morphAttribute[i].clone(data));
      }

      this.morphAttributes.set(morphKey, array);
    }

    this.morphTargetsRelative = source.morphTargetsRelative;

    // groups

    const groups = source.groups;

    for (let i = 0, l = groups.length; i < l; i++) {
      const group = groups[i];
      this.addGroup(group.start, group.count, group.materialIndex);
    }

    // bounding box

    const boundingBox = source.boundingBox;

    if (boundingBox != null) {
      this.boundingBox = boundingBox.clone();
    }

    // bounding sphere

    const boundingSphere = source.boundingSphere;

    if (boundingSphere != null) {
      this.boundingSphere = boundingSphere.clone();
    }

    // draw range

    this.drawRange.start = source.drawRange.start;
    this.drawRange.count = source.drawRange.count;

    // user data

    // this.userData = source.userData;

    return this;
  }

  dispose(): void {
    disposeEvent.target = this;
    this.dispatchEvent(disposeEvent);
  }
}

export function creatBufferGeometry(): BufferGeometry {
  return new BufferGeometry();
}

export function createBufferAttributeF32(
  array: Float32Array,
  itemSize: u32,
  normalized: boolean
): BaseAttribute {
  return new Float32BufferAttribute(array, itemSize, normalized);
}

export function createBufferAttributeu32(
  array: Uint32Array,
  itemSize: u32,
  normalized: boolean
): BaseAttribute {
  return new Uint32BufferAttribute(array, itemSize, normalized);
}

export function setBufferAttribute(
  geometry: BufferGeometry,
  type: AttributeType,
  attributeBuffer: BaseAttribute
): void {
  geometry.setAttribute(type, attributeBuffer);
}

export function setIndexAttribute(
  geometry: BufferGeometry,
  attributeBuffer: BaseAttribute
): void {
  geometry.setIndexAttribute(attributeBuffer as Uint32BufferAttribute);
}
