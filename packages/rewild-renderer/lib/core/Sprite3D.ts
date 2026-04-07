import { Sphere, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Intersection, Raycaster } from './Raycaster';
import { Transform } from './Transform';
import { RenderLayer } from './RenderLayer';
import {
  IComponent,
  IVisualComponent,
  IRaycaster,
} from '../../types/interfaces';
import { IS_VISUAL_COMPONENT } from '../typeGuards';

const _sphere = new Sphere();
const _worldPos = new Vector3();
const _hitTarget = new Vector3();

export class Sprite3D implements IComponent, IVisualComponent {
  readonly [IS_VISUAL_COMPONENT] = true as const;

  geometry: Geometry;
  material: IMaterialPass;
  transform: Transform;
  visible: boolean;

  /** When true, the sprite floats to the screen edge when off-camera. When false, it is hidden. */
  alwaysOnScreen: boolean;

  /** Z-axis rotation offset in radians for the billboard orientation. */
  rotationOffset: f32;

  constructor(geometry: Geometry, material: IMaterialPass) {
    this.geometry = geometry;
    this.material = material;
    this.transform = new Transform();
    this.visible = true;
    this.alwaysOnScreen = false;
    this.rotationOffset = 0;

    this.transform.component = this;
    this.transform.renderLayer = RenderLayer.Overlay;

    this.setMaterial(material);
  }

  setMaterial(material: IMaterialPass) {
    if (this.material && this.material !== material) {
      this.material.perMeshTracker?.onUnassignedFromMesh(this);
      this.material.sharedUniformsTracker?.onUnassignedFromMesh(this);
    }

    this.material = material;
    material.perMeshTracker?.onAssignedToMesh(this);
    material.sharedUniformsTracker?.onAssignedToMesh(this);
  }

  raycast(raycaster: IRaycaster, intersects: Intersection[]) {
    if (raycaster instanceof Raycaster) {
      const matrixWorld = this.transform.matrixWorld;

      // Use a bounding sphere centered at the sprite's world position
      _worldPos.setFromMatrixPosition(matrixWorld);
      const radius =
        Math.max(this.transform.scale.x, this.transform.scale.y) * 0.5;
      _sphere.set(_worldPos, radius);

      const ray = raycaster.ray;
      if (ray.intersectSphere(_sphere, _hitTarget) === null) return;

      const distance = ray.origin.distanceTo(_hitTarget);

      if (distance < raycaster.near || distance > raycaster.far) return;

      const intersection = new Intersection();
      intersection.distance = distance;
      intersection.point = _hitTarget.clone();
      intersection.object = this.transform;
      intersection.face = null;
      intersects.push(intersection);
    }
  }
}
