import { Vector3, Matrix4 } from 'rewild-common';
import { Transform } from './Transform';
import { ITransformObserver } from '../../types/interfaces';

export class Camera implements ITransformObserver {
  readonly transform: Transform;
  readonly matrixWorldInverse: Matrix4 = new Matrix4();
  readonly projectionMatrix: Matrix4 = new Matrix4();
  readonly projectionMatrixInverse: Matrix4 = new Matrix4();

  /**
   * Linear scale applied to HDR radiance immediately before the ACES curve —
   * the whole frame's single exposure knob.
   *
   * This was `HDR_SCALE`, a constant duplicated inside the sky shaders back
   * when the sky was the only thing being tonemapped. Now that one curve covers
   * the whole frame, scene, sky, clouds and god rays all have to be exposed
   * together, so the value belongs to the camera looking at them rather than to
   * any one pass.
   *
   * For scale, at 0.06: blue sky lands around 7 HDR, clouds ~40, the sun corona
   * ~290. Deliberately a plain multiplier rather than an aperture/shutter/ISO
   * triple — the atmosphere's radiance scale is already hand-tuned in absolute
   * terms, and this is the number it was tuned against.
   *
   * Lives on `Camera` rather than on `PerspectiveCamera` (where the other film
   * properties sit) because `Camera` is what the render passes are handed, and
   * the tonemap and the sky composite both need to read it.
   */
  exposure: f32 = 0.06;

  constructor() {
    this.transform = new Transform();
    this.transform.observers.push(this);
  }

  copy(source: Camera): Camera {
    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    this.exposure = source.exposure;

    return this;
  }

  worldMatrixUpdated(source: Transform): void {
    this.matrixWorldInverse.copy(source.matrixWorld).invert();
  }

  getWorldDirection(target: Vector3): Vector3 {
    this.transform.updateWorldMatrix(true, false);

    const e = this.transform.matrixWorld.elements;

    return target.set(-e[8], -e[9], -e[10]).normalize() as Vector3;
  }

  lookAt(x: f32, y: f32, z: f32): void {
    this.transform.lookAt(x, y, z, true);
  }
}
