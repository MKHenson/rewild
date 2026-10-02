import { Color } from 'rewild-common';
import { Light } from './Light';
import { Transform } from '../Transform';

export class DirectionLight extends Light {
  target: Transform;
  transform: Transform;
  /** Whether the sun's cloud and cascade shadows fall on this light. Off for
   *  a light from elsewhere in the sky, such as a lightning flash, which the
   *  sun's shadows would put in the wrong places. */
  shadowed = true;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    super(color, intensity);
    this.target = new Transform();
    this.transform.component = this;
    this.transform.position.copy(Transform.DefaultUp);
  }
}
