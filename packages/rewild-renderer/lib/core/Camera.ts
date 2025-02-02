import { Vector3, Matrix4 } from 'rewild-common';
import { ITransformAttachment, Transform } from './Transform';

export class Camera implements ITransformAttachment {
  readonly transform: Transform;
  readonly matrixWorldInverse: Matrix4 = new Matrix4();
  readonly projectionMatrix: Matrix4 = new Matrix4();
  readonly projectionMatrixInverse: Matrix4 = new Matrix4();

  constructor() {
    this.transform = new Transform();
    this.transform.attachments.push(this);
  }

  copy(source: Camera): Camera {
    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);

    return this;
  }

  worldMatrixUpdated(source: Transform): void {
    this.matrixWorldInverse.copy(source.matrixWorld).invert();
  }

  getWorldDirection(target: Vector3): Vector3 {
    this.transform.updateWorldMatrix(true, false);

    const e = this.transform.matrixWorld.elements;

    return target
      .set(unchecked(-e[8]), unchecked(-e[9]), unchecked(-e[10]))
      .normalize() as Vector3;
  }

  lookAt(x: f32, y: f32, z: f32): void {
    this.transform.lookAt(x, y, z, true);
  }
}
