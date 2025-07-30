import {
  Matrix4,
  Ray,
  Sphere,
  Triangle,
  Vector2,
  Vector3,
} from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Face, Intersection, Raycaster } from './Raycaster';
import { IComponent, Transform } from './Transform';

const _sphere = new Sphere();
const _ray = new Ray();
const _sphereHitAt = new Vector3();
const _intersectionPointWorld = new Vector3();
const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
// const _morphA = new Vector3();
// const _tempA = new Vector3();
const _intersectionPoint = new Vector3();
const _inverseMatrix = new Matrix4();

export class Mesh implements IComponent {
  geometry: Geometry;
  material: IMaterialPass;
  transform: Transform;
  visible: boolean;

  constructor(
    geometry: Geometry,
    material: IMaterialPass,
    transform: Transform = new Transform()
  ) {
    this.geometry = geometry;
    this.transform = transform;
    this.visible = true;

    transform.component = this;

    this.setMaterial(material);
  }

  getVertexPosition(index: number, target: Vector3) {
    const geometry = this.geometry;
    const position = geometry.vertices;
    // const morphPosition = geometry.morphAttributes.position;
    // const morphTargetsRelative = geometry.morphTargetsRelative;

    target.fromBufferAttributeJS(position, index, 3);

    // const morphInfluences = this.morphTargetInfluences;

    // if (morphPosition && morphInfluences) {
    // _morphA.set(0, 0, 0);

    // for (let i = 0, il = morphPosition.length; i < il; i++) {
    // const influence = morphInfluences[i];
    // const morphAttribute = morphPosition[i];

    // if (influence === 0) continue;

    // _tempA.fromBufferAttribute(morphAttribute, index);

    // if (morphTargetsRelative) {
    // _morphA.addScaledVector(_tempA, influence);
    // } else {
    // _morphA.addScaledVector(_tempA.sub(target), influence);
    // }
    // }

    // target.add(_morphA);
    // }

    return target;
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]) {
    const geometry = this.geometry;
    const material = this.material;
    const matrixWorld = this.transform.matrixWorld;

    if (material === undefined) return;

    // test with bounding sphere in world space

    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

    _sphere.copy(geometry.boundingSphere!);
    _sphere.applyMatrix4(matrixWorld);

    // check distance from ray origin to bounding sphere

    _ray.copy(raycaster.ray).recast(raycaster.near);

    if (_sphere.containsPoint(_ray.origin) === false) {
      if (_ray.intersectSphere(_sphere, _sphereHitAt) === null) return;

      if (
        _ray.origin.distanceToSquared(_sphereHitAt) >
        (raycaster.far - raycaster.near) ** 2
      )
        return;
    }

    // convert ray to local space of mesh

    _inverseMatrix.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix);

    // test with bounding box in local space

    if (geometry.boundingBox !== null) {
      if (_ray.intersectsBox(geometry.boundingBox) === false) return;
    }

    // test for intersections with geometry

    this._computeIntersections(raycaster, intersects, _ray);
  }

  _computeIntersections(
    raycaster: Raycaster,
    intersects: Intersection[],
    rayLocalSpace: Ray
  ) {
    let intersection: Intersection | null;

    const geometry = this.geometry;
    const material = this.material;

    const index = geometry.indices;
    const position = geometry.vertices;
    const uv = geometry.uvs;
    const uv1 = geometry.uvs1;
    const normal = geometry.normals;
    const groups = geometry.groups;
    const drawRange = geometry.drawRange;

    if (index) {
      // indexed buffer geometry

      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];

          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(
            index.length,
            Math.min(
              group.start + group.count,
              drawRange.start + drawRange.count
            )
          );

          for (let j = start, jl = end; j < jl; j += 3) {
            const a = index[j];
            const b = index[j + 1];
            const c = index[j + 2];

            intersection = checkGeometryIntersection(
              this,
              groupMaterial,
              raycaster,
              rayLocalSpace,
              uv,
              uv1,
              normal,
              a,
              b,
              c
            );

            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3); // triangle number in indexed buffer semantics
              intersection.face!.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(index.length, drawRange.start + drawRange.count);

        for (let i = start, il = end; i < il; i += 3) {
          const a = index[i];
          const b = index[i + 1];
          const c = index[i + 2];

          intersection = checkGeometryIntersection(
            this,
            material,
            raycaster,
            rayLocalSpace,
            uv,
            uv1,
            normal,
            a,
            b,
            c
          );

          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3); // triangle number in indexed buffer semantics
            intersects.push(intersection);
          }
        }
      }
    } else if (position !== undefined) {
      // non-indexed buffer geometry

      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];

          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(
            position.length / 3,
            Math.min(
              group.start + group.count,
              drawRange.start + drawRange.count
            )
          );

          for (let j = start, jl = end; j < jl; j += 3) {
            const a = j;
            const b = j + 1;
            const c = j + 2;

            intersection = checkGeometryIntersection(
              this,
              groupMaterial,
              raycaster,
              rayLocalSpace,
              uv,
              uv1,
              normal,
              a,
              b,
              c
            );

            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3); // triangle number in non-indexed buffer semantics
              intersection.face!.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(
          position.length / 3,
          drawRange.start + drawRange.count
        );

        for (let i = start, il = end; i < il; i += 3) {
          const a = i;
          const b = i + 1;
          const c = i + 2;

          intersection = checkGeometryIntersection(
            this,
            material,
            raycaster,
            rayLocalSpace,
            uv,
            uv1,
            normal,
            a,
            b,
            c
          );

          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3); // triangle number in non-indexed buffer semantics
            intersects.push(intersection);
          }
        }
      }
    }
  }

  setMaterial(material: IMaterialPass) {
    if (this.material) {
      this.material.perMeshTracker?.onUnassignedFromMesh(this);
      this.material.sharedUniformsTracker?.onUnassignedFromMesh(this);
    }

    if (!material.isGeometryCompatible(this.geometry))
      throw new Error('Material is not compatible with geometry');

    this.material = material;
    material.perMeshTracker?.onAssignedToMesh(this);
    material.sharedUniformsTracker?.onAssignedToMesh(this);
  }
}

function checkIntersection(
  object: Mesh,
  material: IMaterialPass,
  raycaster: Raycaster,
  ray: Ray,
  pA: Vector3,
  pB: Vector3,
  pC: Vector3,
  point: Vector3
) {
  let intersect: Vector3 | null;

  if (material.side === 'cw') {
    intersect = ray.intersectTriangle(pC, pB, pA, true, point);
  } else {
    intersect = ray.intersectTriangle(
      pA,
      pB,
      pC,
      material.side === 'ccw',
      point
    );
  }

  if (intersect === null) return null;

  _intersectionPointWorld.copy(point);
  _intersectionPointWorld.applyMatrix4(object.transform.matrixWorld);

  const distance = raycaster.ray.origin.distanceTo(_intersectionPointWorld);

  if (distance < raycaster.near || distance > raycaster.far) return null;

  return {
    distance: distance,
    point: _intersectionPointWorld.clone(),
    object: object.transform,
  } as Intersection;
}

function checkGeometryIntersection(
  object: Mesh,
  material: IMaterialPass,
  raycaster: Raycaster,
  ray: Ray,
  uv: Float32Array | undefined,
  uv1: Float32Array | undefined,
  normal: Float32Array | undefined,
  a: number,
  b: number,
  c: number
) {
  object.getVertexPosition(a, _vA);
  object.getVertexPosition(b, _vB);
  object.getVertexPosition(c, _vC);

  const intersection = checkIntersection(
    object,
    material,
    raycaster,
    ray,
    _vA,
    _vB,
    _vC,
    _intersectionPoint
  );

  if (intersection) {
    const barycoord = new Vector3();
    Triangle.getBarycoord(_intersectionPoint, _vA, _vB, _vC, barycoord);

    if (uv) {
      intersection.uv = Triangle.getInterpolatedAttribute(
        uv,
        a,
        b,
        c,
        barycoord,
        new Vector2(),
        3
      ) as Vector2;
    }

    if (uv1) {
      intersection.uv1 = Triangle.getInterpolatedAttribute(
        uv1,
        a,
        b,
        c,
        barycoord,
        new Vector2(),
        3
      ) as Vector2;
    }

    if (normal) {
      intersection.normal = Triangle.getInterpolatedAttribute(
        normal,
        a,
        b,
        c,
        barycoord,
        new Vector3(),
        3
      ) as Vector3;

      if (intersection.normal.dot(ray.direction) > 0) {
        intersection.normal.multiplyScalar(-1);
      }
    }

    const face = new Face();
    face.a = a;
    face.b = b;
    face.c = c;
    face.normal = new Vector3();
    face.materialIndex = 0;

    Triangle.getNormal(_vA, _vB, _vC, face.normal);

    intersection.face = face;
    intersection.barycoord = barycoord;
  }

  return intersection;
}
