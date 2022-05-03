import { Vector3 } from "../math/Vector3";
import { Vector2 } from "../math/Vector2";
import { Sphere } from "../math/Sphere";
import { Ray } from "../math/Ray";
import { Matrix4 } from "../math/Matrix4";
import { TransformNode } from "../core/TransformNode";
import { Triangle } from "../math/Triangle";
import { Side } from "../../common/GLEnums";
import { BufferGeometry } from "../core/BufferGeometry";
import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { Raycaster } from "../core/Raycaster";
import { BufferAttribute, Float32BufferAttribute } from "../core/BufferAttribute";
import { SkinnedMesh } from "./SkinnedMesh";
import { PipelineInstance } from "../pipelines/PipelineInstance";
import { AttributeType } from "../../common/AttributeType";

export class Face {
  public a: i32;
  public b: i32;
  public c: i32;
  public normal: Vector3;
  public materialIndex: i32;
}

export class Intersection {
  public distance: f32;
  public point: Vector3;
  public object: TransformNode;
  public faceIndex: i32;
  public face: Face | null;
  public uv: Vector2 | null;
  public uv2: Vector2 | null;
  public instanceId: i32;
}

const _inverseMatrix = new Matrix4();
const _ray = new Ray();
const _sphere = new Sphere();

const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();

const _tempA = new Vector3();
const _tempB = new Vector3();
const _tempC = new Vector3();

const _morphA = new Vector3();
const _morphB = new Vector3();
const _morphC = new Vector3();

const _uvA = new Vector2();
const _uvB = new Vector2();
const _uvC = new Vector2();

const _intersectionPoint = new Vector3();
const _intersectionPointWorld = new Vector3();

export class Mesh extends TransformNode {
  pipelines: MeshPipelineInstance[];
  geometry: BufferGeometry;
  morphTargetInfluences: f32[] | null;
  morphTargetDictionary: Map<string, i32> | null;

  constructor(geometry: BufferGeometry = new BufferGeometry(), pipelines: MeshPipelineInstance[] = []) {
    super();

    this.type = "Mesh";

    this.geometry = geometry;
    this.pipelines = pipelines;
    this.morphTargetInfluences = null;
    this.morphTargetDictionary = null;

    this.updateMorphTargets();
  }

  copy(source: Mesh, recursive: boolean = true): Mesh {
    super.copy(source, recursive);

    const sourceMorphTargetInfluences = source.morphTargetInfluences;
    if (sourceMorphTargetInfluences != null) {
      this.morphTargetInfluences = sourceMorphTargetInfluences.slice(0);
    }

    const sourceMorphTargetDictionary = source.morphTargetDictionary;
    if (sourceMorphTargetDictionary != null) {
      this.morphTargetDictionary = new Map();
      const keys = sourceMorphTargetDictionary.keys();

      const morphTargetDictionary = this.morphTargetDictionary;

      for (let i: i32 = 0; i < keys.length; i++)
        morphTargetDictionary!.set(keys[i], sourceMorphTargetDictionary.get(keys[i]));
    }

    this.pipelines = new Array(source.pipelines.length);
    for (let i: i32 = 0; i < source.pipelines.length; i++)
      this.pipelines[i] = source.pipelines[i].clone() as MeshPipelineInstance;

    this.geometry = source.geometry;

    return this;
  }

  updateMorphTargets(): void {
    const geometry = this.geometry;

    const morphAttributes = geometry.morphAttributes;
    const keys = morphAttributes.keys();

    if (keys.length > 0) {
      const morphAttribute = morphAttributes.get(keys[0]);

      if (morphAttribute !== null) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = new Map();

        for (let m: i32 = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || m.toString();

          this.morphTargetInfluences!.push(0);
          this.morphTargetDictionary!.set(name, m);
        }
      }
    }
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    const geometry = this.geometry;
    const pipelines = this.pipelines;
    const matrixWorld = this.matrixWorld;

    // Checking boundingSphere distance to ray

    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

    _sphere.copy(geometry.boundingSphere!);
    _sphere.applyMatrix4(matrixWorld);

    if (raycaster.ray.intersectsSphere(_sphere) === false) return;

    //

    _inverseMatrix.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix);

    // Check boundingBox before continuing

    if (geometry.boundingBox !== null) {
      if (_ray.intersectsBox(geometry.boundingBox!) === false) return;
    }

    let intersection: Intersection | null = null;

    const indexes = geometry.indexes;

    const position = geometry.getAttribute<Float32BufferAttribute>(AttributeType.POSITION)!;
    const morphPosition = geometry.getMorphAttribute<Float32BufferAttribute>(AttributeType.POSITION);
    const morphTargetsRelative = geometry.morphTargetsRelative;
    const uv = geometry.getAttribute<Float32BufferAttribute>(AttributeType.UV);
    const uv2 = geometry.getAttribute<Float32BufferAttribute>(AttributeType.UV);
    const groups = geometry.groups;
    const drawRange = geometry.drawRange;

    if (indexes !== null) {
      const index = indexes;

      // indexed buffer geometry

      if (pipelines.length > 1) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupPipeline = pipelines[group.materialIndex];

          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(group.start + group.count, drawRange.start + drawRange.count);

          for (let j: u32 = u32(start), jl: u32 = u32(end); j < jl; j += 3) {
            const a = index.getX(j);
            const b = index.getX(j + 1);
            const c = index.getX(j + 2);

            intersection = checkBufferGeometryIntersection(
              this,
              groupPipeline,
              raycaster,
              _ray,
              position,
              morphPosition,
              morphTargetsRelative,
              uv,
              uv2,
              a,
              b,
              c
            );

            if (intersection) {
              intersection.faceIndex = i32(Math.floor(j / 3)); // triangle number in indexed buffer semantics
              intersection.face!.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(index.count, drawRange.start + drawRange.count);

        for (let i: i32 = i32(start), il: i32 = i32(end); i < il; i += 3) {
          const a = index.getX(i);
          const b = index.getX(i + 1);
          const c = index.getX(i + 2);

          intersection = checkBufferGeometryIntersection(
            this,
            pipelines[0],
            raycaster,
            _ray,
            position,
            morphPosition,
            morphTargetsRelative,
            uv,
            uv2,
            a,
            b,
            c
          );

          if (intersection) {
            intersection.faceIndex = i32(Math.floor(i / 3)); // triangle number in indexed buffer semantics
            intersects.push(intersection);
          }
        }
      }
    } else if (position !== null) {
      // non-indexed buffer geometry

      if (pipelines.length > 1) {
        for (let i: i32 = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupPipeline = pipelines[group.materialIndex];

          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(group.start + group.count, drawRange.start + drawRange.count);

          for (let j: i32 = i32(start), jl: i32 = i32(end); j < jl; j += 3) {
            const a = j;
            const b = j + 1;
            const c = j + 2;

            intersection = checkBufferGeometryIntersection(
              this,
              groupPipeline,
              raycaster,
              _ray,
              position,
              morphPosition,
              morphTargetsRelative,
              uv,
              uv2,
              a,
              b,
              c
            );

            if (intersection) {
              intersection.faceIndex = i32(Math.floor(f32(j) / f32(3))); // triangle number in non-indexed buffer semantics
              intersection.face!.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(position.count, drawRange.start + drawRange.count);

        for (let i: i32 = i32(start), il: i32 = i32(end); i < il; i += 3) {
          const a: i32 = i;
          const b: i32 = i + 1;
          const c: i32 = i + 2;

          intersection = checkBufferGeometryIntersection(
            this,
            pipelines[0],
            raycaster,
            _ray,
            position,
            morphPosition,
            morphTargetsRelative,
            uv,
            uv2,
            a,
            b,
            c
          );

          if (intersection) {
            intersection.faceIndex = i32(Math.floor(i / 3)); // triangle number in non-indexed buffer semantics
            intersects.push(intersection);
          }
        }
      }
    }
  }
}

function checkIntersection(
  object: TransformNode,
  pipeline: PipelineInstance,
  raycaster: Raycaster,
  ray: Ray,
  pA: Vector3,
  pB: Vector3,
  pC: Vector3,
  point: Vector3
): Intersection | null {
  let intersect: Vector3 | null = null;

  if (pipeline.side === Side.BackSide) {
    intersect = ray.intersectTriangle(pC, pB, pA, true, point);
  } else {
    intersect = ray.intersectTriangle(pA, pB, pC, pipeline.side !== Side.DoubleSide, point);
  }

  if (intersect === null) return null;

  _intersectionPointWorld.copy(point);
  _intersectionPointWorld.applyMatrix4(object.matrixWorld);

  const distance: f32 = raycaster.ray.origin.distanceTo(_intersectionPointWorld);

  if (distance < raycaster.near || distance > raycaster.far) return null;

  return {
    distance: distance,
    point: _intersectionPointWorld.clone(),
    object: object,
    face: null,
    uv: null,
    uv2: null,
    faceIndex: -1,
    instanceId: -1,
  };
}

function checkBufferGeometryIntersection(
  object: Mesh,
  pipeline: PipelineInstance,
  raycaster: Raycaster,
  ray: Ray,
  position: BufferAttribute<f32, Float32Array>,
  morphPosition: Float32BufferAttribute[] | null,
  morphTargetsRelative: boolean,
  uv: BufferAttribute<f32, Float32Array> | null,
  uv2: BufferAttribute<f32, Float32Array> | null,
  a: i32,
  b: i32,
  c: i32
): Intersection | null {
  _vA.fromBufferAttribute(position, a);
  _vB.fromBufferAttribute(position, b);
  _vC.fromBufferAttribute(position, c);

  const morphInfluences = object.morphTargetInfluences;

  if (morphPosition && morphInfluences) {
    _morphA.set(0, 0, 0);
    _morphB.set(0, 0, 0);
    _morphC.set(0, 0, 0);

    for (let i = 0, il = morphPosition.length; i < il; i++) {
      const influence = morphInfluences[i];
      const morphAttribute = morphPosition[i];

      if (influence === 0) continue;

      _tempA.fromBufferAttribute(morphAttribute, a);
      _tempB.fromBufferAttribute(morphAttribute, b);
      _tempC.fromBufferAttribute(morphAttribute, c);

      if (morphTargetsRelative) {
        _morphA.addScaledVector(_tempA, influence);
        _morphB.addScaledVector(_tempB, influence);
        _morphC.addScaledVector(_tempC, influence);
      } else {
        _morphA.addScaledVector(_tempA.sub(_vA), influence);
        _morphB.addScaledVector(_tempB.sub(_vB), influence);
        _morphC.addScaledVector(_tempC.sub(_vC), influence);
      }
    }

    _vA.add(_morphA);
    _vB.add(_morphB);
    _vC.add(_morphC);
  }

  if (object instanceof SkinnedMesh) {
    const smesh = object as SkinnedMesh;
    smesh.boneTransform(a, _vA);
    smesh.boneTransform(b, _vB);
    smesh.boneTransform(c, _vC);
  }

  const intersection: Intersection | null = checkIntersection(
    object,
    pipeline,
    raycaster,
    ray,
    _vA,
    _vB,
    _vC,
    _intersectionPoint
  );

  if (intersection) {
    if (uv) {
      _uvA.fromBufferAttribute(uv, a);
      _uvB.fromBufferAttribute(uv, b);
      _uvC.fromBufferAttribute(uv, c);

      intersection.uv = Triangle.getUV(_intersectionPoint, _vA, _vB, _vC, _uvA, _uvB, _uvC, new Vector2());
    }

    if (uv2) {
      _uvA.fromBufferAttribute(uv2, a);
      _uvB.fromBufferAttribute(uv2, b);
      _uvC.fromBufferAttribute(uv2, c);

      intersection.uv2 = Triangle.getUV(_intersectionPoint, _vA, _vB, _vC, _uvA, _uvB, _uvC, new Vector2());
    }

    const face: Face = {
      a: a,
      b: b,
      c: c,
      normal: new Vector3(),
      materialIndex: 0,
    };

    Triangle.getNormal(_vA, _vB, _vC, face.normal);

    intersection.face = face;
  }

  return intersection;
}
