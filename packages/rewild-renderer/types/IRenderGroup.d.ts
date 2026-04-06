import { Geometry } from '../lib/geometry/Geometry';
import { IMaterialPass } from '../lib/materials/IMaterialPass';
import { IVisualComponent } from './interfaces';

export interface IRenderGroup {
  geometry: Geometry;
  meshes: IVisualComponent[];
  pass: IMaterialPass;
}
