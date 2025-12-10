import { Color } from 'rewild-common';
import { Light } from './Light';
import { Transform } from '../Transform';

export class PointLight extends Light {
  private _radius: f32;
  transform: Transform;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    super(color, intensity);
    this._radius = 1.0;
    this.transform.component = this;
  }

  get radius(): f32 {
    return this._radius;
  }

  set radius(value: f32) {
    this._radius = value;
    this.transform.scale.set(value, value, value);
  }
}
