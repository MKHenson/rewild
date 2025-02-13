import { Mesh } from '../lib/core/Mesh';
import { Geometry } from '../lib/geometry/Geometry';
import { IMaterialPass } from '../lib/materials/IMaterialPass';

export interface IRenderGroup {
  geometry: Geometry;
  meshes: Mesh[];
  pass: IMaterialPass;
}
