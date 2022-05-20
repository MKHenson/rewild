import { EngineMatrix4 } from "../math/Matrix4";
import { TransformNode } from "../core/TransformNode";
import { EngineVector3 } from "../math/Vector3";

export class Camera extends TransformNode {
  readonly matrixWorldInverse: EngineMatrix4 = new EngineMatrix4();
  readonly projectionMatrix: EngineMatrix4 = new EngineMatrix4();
  readonly projectionMatrixInverse: EngineMatrix4 = new EngineMatrix4();

  constructor() {
    super();
    this.type = "Camera";
  }

  copy(source: Camera, recursive: boolean = true): Camera {
    super.copy(source, recursive);

    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);

    return this;
  }

  getWorldDirection(target: EngineVector3): EngineVector3 {
    this.updateWorldMatrix(true, false);

    const e = this.matrixWorld.elements;

    return target.set(unchecked(-e[8]), unchecked(-e[9]), unchecked(-e[10])).normalize();
  }

  updateMatrixWorld(force: boolean = false): void {
    super.updateMatrixWorld(force);

    this.matrixWorldInverse.copy(this.matrixWorld).invertSIMD();
  }

  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    super.updateWorldMatrix(updateParents, updateChildren);

    this.matrixWorldInverse.copy(this.matrixWorld).invertSIMD();
  }

  clone(recursive: boolean = false): TransformNode {
    return new Camera().copy(this);
  }
}
