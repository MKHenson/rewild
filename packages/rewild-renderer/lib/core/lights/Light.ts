import { Color } from 'rewild-common';
import { IComponent } from '../Transform';

export class Light implements IComponent {
  color: Color;
  intensity: f32;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    this.color = color;
    this.intensity = intensity;
  }
}
