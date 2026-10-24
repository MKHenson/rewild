import { Box3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { SkinnedInstancedPass } from '../materials/SkinnedInstancedPass';
import { IS_VISUAL_COMPONENT } from '../typeGuards';
import { IComponent, IVisualComponent } from '../../types/interfaces';
import { Transform } from './Transform';
import type { SkinnedInstance } from './SkinnedInstance';

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

  raycast(): void {}
}
