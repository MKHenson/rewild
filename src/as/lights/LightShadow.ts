import { Matrix4 } from "../math/Matrix4";
import { Vector2 } from "../math/Vector2";
import { Vector3 } from "../math/Vector3";
import { Vector4 } from "../math/Vector4";
import { Frustum } from "../math/Frustum";
import { Camera } from "../cameras/Camera";
import { Light } from "./Light";
import { DirectionalLight } from "./DirectionalLight";
import { SpotLight } from "./SpotLight";

const _projScreenMatrix = new Matrix4();
const _lightPositionWorld = new Vector3();
const _lookTarget = new Vector3();

export class LightShadow {
  camera: Camera;
  bias: f32;
  normalBias: f32;
  radius: f32;
  mapSize: Vector2;
  // map: Texture | null;
  //   mapPass: null;
  matrix: Matrix4;
  autoUpdate: boolean;
  needsUpdate: boolean;
  _frustum: Frustum;
  _frameExtents: Vector2;
  _viewportCount: i32;
  _viewports: Vector4[];

  constructor(camera: Camera) {
    this.camera = camera;

    this.bias = 0;
    this.normalBias = 0;
    this.radius = 1;

    this.mapSize = new Vector2(512, 512);

    // this.map = null;
    // this.mapPass = null;
    this.matrix = new Matrix4();

    this.autoUpdate = true;
    this.needsUpdate = false;

    this._frustum = new Frustum();
    this._frameExtents = new Vector2(1, 1);

    this._viewportCount = 1;

    this._viewports = [new Vector4(0, 0, 1, 1)];
  }

  getViewportCount(): i32 {
    return this._viewportCount;
  }

  getFrustum(): Frustum {
    return this._frustum;
  }

  updateMatrices(light: Light): void {
    const shadowCamera = this.camera;
    const shadowMatrix = this.matrix;

    _lightPositionWorld.setFromMatrixPosition(light.matrixWorld);
    shadowCamera.position.copy(_lightPositionWorld);

    const target =
      light instanceof DirectionalLight
        ? (light as DirectionalLight).target
        : light instanceof SpotLight
        ? (light as SpotLight).target
        : null;

    _lookTarget.setFromMatrixPosition(target!.matrixWorld);
    shadowCamera.lookAt(_lookTarget.x, _lookTarget.y, _lookTarget.z);
    shadowCamera.updateMatrixWorld();

    _projScreenMatrix.multiplyMatricesSIMD(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(_projScreenMatrix);

    // prettier-ignore
    shadowMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
    );

    shadowMatrix.multiplySIMD(shadowCamera.projectionMatrix);
    shadowMatrix.multiplySIMD(shadowCamera.matrixWorldInverse);
  }

  getViewport(viewportIndex: u32): Vector4 {
    return this._viewports[viewportIndex];
  }

  getFrameExtents(): Vector2 {
    return this._frameExtents;
  }

  dispose(): void {
    // if (this.map) {
    //   this.map.dispose();
    // }
    // if (this.mapPass) {
    //   this.mapPass.dispose();
    // }
  }

  copy(source: LightShadow): LightShadow {
    this.camera = source.camera.clone() as Camera;

    this.bias = source.bias;
    this.radius = source.radius;

    this.mapSize.copy(source.mapSize);

    return this;
  }

  clone(): LightShadow {
    return new LightShadow(this.camera).copy(this);
  }

  // TODO:
  // toJSON() {

  // 	const object = {};

  // 	if ( this.bias !== 0 ) object.bias = this.bias;
  // 	if ( this.normalBias !== 0 ) object.normalBias = this.normalBias;
  // 	if ( this.radius !== 1 ) object.radius = this.radius;
  // 	if ( this.mapSize.x !== 512 || this.mapSize.y !== 512 ) object.mapSize = this.mapSize.toArray();

  // 	object.camera = this.camera.toJSON( false ).object;
  // 	delete object.camera.matrix;

  // 	return object;

  // }
}
