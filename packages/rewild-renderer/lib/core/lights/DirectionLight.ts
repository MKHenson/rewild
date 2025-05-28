import { Color } from 'rewild-common';
import { Light } from './Light';
import { Transform } from '../Transform';

export class DirectionLight extends Light {
  target: Transform;
  transform: Transform;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    super(color, intensity);
    this.target = new Transform();
    this.transform = new Transform();
    this.transform.component = this;
    this.transform.position.copy(Transform.DefaultUp);
  }
}
