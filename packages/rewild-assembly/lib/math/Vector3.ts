import { Camera } from '../cameras/Camera';
import { BufferAttribute } from '../core/BufferAttribute';
import { Vector3 } from 'rewild-common';

export class EngineVector3 extends Vector3 {
  constructor(x: f32 = 0, y: f32 = 0, z: f32 = 0) {
    super(x, y, z);
  }

  clone(): EngineVector3 {
    return new EngineVector3(this.x, this.y, this.z);
  }

  projectCamera(camera: Camera): EngineVector3 {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(
      camera.projectionMatrix
    ) as EngineVector3;
  }

  unprojectCamera(camera: Camera): EngineVector3 {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(
      camera.matrixWorld
    ) as EngineVector3;
  }

  fromBufferAttribute(
    attribute: BufferAttribute<f32, Float32Array>,
    index: u32
  ): EngineVector3 {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);

    return this;
  }
}
