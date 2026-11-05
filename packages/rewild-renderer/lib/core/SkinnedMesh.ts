import { Box3, Matrix4, Ray, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { SkinnedInstancedPass } from '../materials/SkinnedInstancedPass';
import { IS_VISUAL_COMPONENT } from '../typeGuards';
import {
  IComponent,
  IRaycaster,
  IVisualComponent,
} from '../../types/interfaces';
import { Intersection, Raycaster } from './Raycaster';
import { Transform } from './Transform';
import type { SkinnedInstance } from './SkinnedInstance';

const _inverse = new Matrix4();
const _ray = new Ray();
const _hit = new Vector3();

/**
 * One primitive of a skinned model, drawn in the pose of the SkinnedInstance
 * it belongs to: the skinned counterpart of Mesh. SkinnedInstance creates
 * these; every SkinnedMesh sharing a pass is drawn in one instanced call.
 */
export class SkinnedMesh implements IComponent, IVisualComponent {
  readonly [IS_VISUAL_COMPONENT] = true as const;

  geometry: Geometry;
  material: SkinnedInstancedPass;
  transform: Transform;
  visible = true;
  castShadow = true;
  readonly instance: SkinnedInstance;

  constructor(
    geometry: Geometry,
    material: SkinnedInstancedPass,
    instance: SkinnedInstance,
    transform: Transform = new Transform()
  ) {
    if (!material.isGeometryCompatible(geometry))
      throw new Error('Material is not compatible with geometry');

    this.geometry = geometry;
    this.material = material;
    this.instance = instance;
    this.transform = transform;
    transform.component = this;
  }

  /** Bounds that hold the model however its joints bend. */
  get localBounds(): Box3 {
    return this.material.model!.localBounds;
  }

  /** Hits `localBounds` when the raycaster asks for skinned meshes. */
  raycast(raycaster: IRaycaster, intersects: Intersection[]): void {
    if (!(raycaster instanceof Raycaster) || !raycaster.hitsSkinned) return;

    const matrixWorld = this.transform.matrixWorld;
    _inverse.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverse);
    if (_ray.intersectBox(this.localBounds, _hit) === null) return;

    _hit.applyMatrix4(matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(_hit);
    if (distance < raycaster.near || distance > raycaster.far) return;

    const intersection = new Intersection();
    intersection.distance = distance;
    intersection.point = _hit.clone();
    intersection.object = this.transform;
    intersection.face = null;
    intersects.push(intersection);
  }
}
