import { Color } from 'rewild-common';
import { Transform } from '../Transform';
import { Intersection } from '../Raycaster';
import { IComponent, IRaycaster } from '../../../types/interfaces';

export class Light implements IComponent {
  color: Color;

  /**
   * Radiance on the sky's scale, not a photometric unit. For a directional
   * light that is simply the value that reaches every surface. For point and
   * spot lights, `lightDistanceAttenuation` divides it by distance squared, so
   * it reads as "the brightness this light delivers at one unit away" — which
   * is why converted values look large next to the ones that preceded them.
   *
   * Converting an intensity authored against the old `1 - dist/range` ramp,
   * preserving how bright the light looked at its mid-range reference distance:
   *
   *     new = old * (32 / 225) * range^2      (~0.1422 * range^2)
   *
   * That factor is `A_old(range/2) / A_new(range/2)` with the old ramp's 0.5
   * over the new curve's `(15/16)^2 / (range/2)^2`. A spot light authored
   * against the plateau falloff that briefly replaced the ramp needs its own
   * A_old — the plateau sat at ~0.93 at mid-range, not 0.5, so its factor is
   * about 1.85x larger.
   */
  intensity: f32;

  transform: Transform;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    this.color = color;
    this.intensity = intensity;
    this.transform = new Transform();
  }

  raycast(raycaster: IRaycaster, intersects: Intersection[]) {}
}
