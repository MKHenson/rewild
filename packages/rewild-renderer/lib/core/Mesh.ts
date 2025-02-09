import { Geometry } from '../geometry/Geometry';
import { IMaterial } from '../materials/IMaterial';
import { Transform } from './Transform';

export class Mesh {
  geometry: Geometry;
  material: IMaterial;
  transform: Transform;

  constructor(
    geometry: Geometry,
    material: IMaterial,
    transform: Transform = new Transform()
  ) {
    this.geometry = geometry;
    this.transform = transform;

    this.setMaterial(material);
  }

  setMaterial(material: IMaterial) {
    if (this.material) {
      this.material.meshManager.onUnassignedFromMesh(this);
    }

    if (!material.isGeometryCompatible(this.geometry))
      throw new Error('Material is not compatible with geometry');

    this.material = material;
    material.meshManager.onAssignedToMesh(this);
  }
}
