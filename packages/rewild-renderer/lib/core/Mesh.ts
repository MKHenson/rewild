import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { IVisual, Transform } from './Transform';

export class Mesh implements IVisual {
  geometry: Geometry;
  material: IMaterialPass;
  transform: Transform;

  constructor(
    geometry: Geometry,
    material: IMaterialPass,
    transform: Transform = new Transform()
  ) {
    this.geometry = geometry;
    this.transform = transform;

    transform.renderable = this;

    this.setMaterial(material);
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
