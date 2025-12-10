import { Color } from 'rewild-common';
import { IComponent, Transform } from '../Transform';
import { Raycaster, Intersection } from '../Raycaster';

export class Light implements IComponent {
  color: Color;
  intensity: f32;
  transform: Transform;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    this.color = color;
    this.intensity = intensity;
    this.transform = new Transform();
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]) {}
}
