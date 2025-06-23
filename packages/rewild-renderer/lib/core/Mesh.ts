import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Intersection, Raycaster } from './Raycaster';
import { IComponent, Transform } from './Transform';

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

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    // const geometry = this.geometry;
    // const pipelines = this.pipelines;
    // const matrixWorld = this.transform!.matrixWorld;
    // // Checking boundingSphere distance to ray
    // if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    // _sphere.copy(geometry.boundingSphere!);
    // _sphere.applyMatrix4(matrixWorld);
    // if (raycaster.ray.intersectsSphere(_sphere) === false) return;
    // //
    // _inverseMatrix.copy(matrixWorld).invertSIMD();
    // _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix);
    // // Check boundingBox before continuing
    // if (geometry.boundingBox != null) {
    //   if (_ray.intersectsBox(geometry.boundingBox!) === false) return;
    // }
    // let intersection: Intersection | null = null;
    // const indexes = geometry.indexes;
    // const position = geometry.getAttribute<Float32BufferAttribute>(
    //   AttributeType.POSITION
    // )!;
    // const morphPosition = geometry.getMorphAttribute<Float32BufferAttribute>(
    //   AttributeType.POSITION
    // );
    // const morphTargetsRelative = geometry.morphTargetsRelative;
    // const uv = geometry.getAttribute<Float32BufferAttribute>(AttributeType.UV);
    // const uv2 = geometry.getAttribute<Float32BufferAttribute>(AttributeType.UV);
    // const groups = geometry.groups;
    // const drawRange = geometry.drawRange;
    // if (indexes != null) {
    //   const index = indexes;
    //   // indexed buffer geometry
    //   if (pipelines.length > 1) {
    //     for (let i = 0, il = groups.length; i < il; i++) {
    //       const group = unchecked(groups[i]);
    //       const groupPipeline = unchecked(pipelines[group.materialIndex]);
    //       const start = Math.max(group.start, drawRange.start);
    //       const end = Math.min(
    //         group.start + group.count,
    //         drawRange.start + drawRange.count
    //       );
    //       for (let j: u32 = u32(start), jl: u32 = u32(end); j < jl; j += 3) {
    //         const a = index.getX(j);
    //         const b = index.getX(j + 1);
    //         const c = index.getX(j + 2);
    //         intersection = checkBufferGeometryIntersection(
    //           this,
    //           groupPipeline,
    //           raycaster,
    //           _ray,
    //           position,
    //           morphPosition,
    //           morphTargetsRelative,
    //           uv,
    //           uv2,
    //           a,
    //           b,
    //           c
    //         );
    //         if (intersection) {
    //           intersection.faceIndex = i32(Math.floor(j / 3)); // triangle number in indexed buffer semantics
    //           intersection.face!.materialIndex = group.materialIndex;
    //           intersects.push(intersection);
    //         }
    //       }
    //     }
    //   } else {
    //     const start = Math.max(0, drawRange.start);
    //     const end = Math.min(index.count, drawRange.start + drawRange.count);
    //     for (let i: i32 = i32(start), il: i32 = i32(end); i < il; i += 3) {
    //       const a = index.getX(i);
    //       const b = index.getX(i + 1);
    //       const c = index.getX(i + 2);
    //       intersection = checkBufferGeometryIntersection(
    //         this,
    //         unchecked(pipelines[0]),
    //         raycaster,
    //         _ray,
    //         position,
    //         morphPosition,
    //         morphTargetsRelative,
    //         uv,
    //         uv2,
    //         a,
    //         b,
    //         c
    //       );
    //       if (intersection) {
    //         intersection.faceIndex = i32(Math.floor(i / 3)); // triangle number in indexed buffer semantics
    //         intersects.push(intersection);
    //       }
    //     }
    //   }
    // } else if (position != null) {
    //   // non-indexed buffer geometry
    //   if (pipelines.length > 1) {
    //     for (let i: i32 = 0, il = groups.length; i < il; i++) {
    //       const group = unchecked(groups[i]);
    //       const groupPipeline = unchecked(pipelines[group.materialIndex]);
    //       const start = Math.max(group.start, drawRange.start);
    //       const end = Math.min(
    //         group.start + group.count,
    //         drawRange.start + drawRange.count
    //       );
    //       for (let j: i32 = i32(start), jl: i32 = i32(end); j < jl; j += 3) {
    //         const a = j;
    //         const b = j + 1;
    //         const c = j + 2;
    //         intersection = checkBufferGeometryIntersection(
    //           this,
    //           groupPipeline,
    //           raycaster,
    //           _ray,
    //           position,
    //           morphPosition,
    //           morphTargetsRelative,
    //           uv,
    //           uv2,
    //           a,
    //           b,
    //           c
    //         );
    //         if (intersection) {
    //           intersection.faceIndex = i32(Math.floor(f32(j) / f32(3))); // triangle number in non-indexed buffer semantics
    //           intersection.face!.materialIndex = group.materialIndex;
    //           intersects.push(intersection);
    //         }
    //       }
    //     }
    //   } else {
    //     const start = Math.max(0, drawRange.start);
    //     const end = Math.min(position.count, drawRange.start + drawRange.count);
    //     for (let i: i32 = i32(start), il: i32 = i32(end); i < il; i += 3) {
    //       const a: i32 = i;
    //       const b: i32 = i + 1;
    //       const c: i32 = i + 2;
    //       intersection = checkBufferGeometryIntersection(
    //         this,
    //         unchecked(pipelines[0]),
    //         raycaster,
    //         _ray,
    //         position,
    //         morphPosition,
    //         morphTargetsRelative,
    //         uv,
    //         uv2,
    //         a,
    //         b,
    //         c
    //       );
    //       if (intersection) {
    //         intersection.faceIndex = i32(Math.floor(i / 3)); // triangle number in non-indexed buffer semantics
    //         intersects.push(intersection);
    //       }
    //     }
    //   }
    // }
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
