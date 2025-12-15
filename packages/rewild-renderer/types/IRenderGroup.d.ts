import { Geometry } from '../lib/geometry/Geometry';
import { IMaterialPass } from '../lib/materials/IMaterialPass';
import { IMeshComponent } from './interfaces';

export interface IRenderGroup {
  geometry: Geometry;
  meshes: IMeshComponent[];
  pass: IMaterialPass;
}
