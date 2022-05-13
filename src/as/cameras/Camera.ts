import { Matrix4 } from "../math/Matrix4";
import { TransformNode } from "../core/TransformNode";
import { Vector3 } from "../math/Vector3";

export class Camera extends TransformNode {
  readonly matrixWorldInverse: Matrix4 = new Matrix4();
  readonly projectionMatrix: Matrix4 = new Matrix4();
  readonly projectionMatrixInverse: Matrix4 = new Matrix4();

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

  getWorldDirection(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);

    const e = this.matrixWorld.elements;

    return target.set(-e[8], -e[9], -e[10]).normalize();
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
