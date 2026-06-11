import { Color } from 'rewild-common';
import { Light } from './Light';
import { Transform } from '../Transform';

export class SpotLight extends Light {
  target: Transform;
  range: f32;
  innerAngle: f32;
  outerAngle: f32;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    super(color, intensity);
    this.target = new Transform();
    this.transform.component = this;
    this.range = 15.0;
    this.innerAngle = Math.PI / 12; // 15°
    this.outerAngle = Math.PI / 8;  // 22.5°
  }
}
