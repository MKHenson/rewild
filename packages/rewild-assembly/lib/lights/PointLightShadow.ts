import { LightShadow } from './LightShadow';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera';
import { EngineMatrix4 } from '../math/EngineMatrix4';
import { EngineVector2 } from '../math/Vector2';
import { EngineVector3 } from '../math/Vector3';
import { EngineVector4 } from '../math/Vector4';
import { PointLight } from './PointLight';

const _projScreenMatrix = new EngineMatrix4();
const _lightPositionWorld = new EngineVector3();
const _lookTarget = new EngineVector3();

export class PointLightShadow extends LightShadow {
  _cubeDirections: EngineVector3[];
  _cubeUps: EngineVector3[];

  constructor() {
    super(new PerspectiveCamera(90, 1, 0.5, 500));

    this._frameExtents = new EngineVector2(4, 2);

    this._viewportCount = 6;

    this._viewports = [
      // These viewports map a cube-map onto a 2D texture with the
      // following orientation:
      //
      //  xzXZ
      //   y Y
      //
      // X - Positive x direction
      // x - Negative x direction
      // Y - Positive y direction
      // y - Negative y direction
      // Z - Positive z direction
      // z - Negative z direction

      // positive X
      new EngineVector4(2, 1, 1, 1),
      // negative X
      new EngineVector4(0, 1, 1, 1),
      // positive Z
      new EngineVector4(3, 1, 1, 1),
      // negative Z
      new EngineVector4(1, 1, 1, 1),
      // positive Y
      new EngineVector4(3, 0, 1, 1),
      // negative Y
      new EngineVector4(1, 0, 1, 1),
    ];

    this._cubeDirections = [
      new EngineVector3(1, 0, 0),
      new EngineVector3(-1, 0, 0),
      new EngineVector3(0, 0, 1),
      new EngineVector3(0, 0, -1),
      new EngineVector3(0, 1, 0),
      new EngineVector3(0, -1, 0),
    ];

    this._cubeUps = [
      new EngineVector3(0, 1, 0),
      new EngineVector3(0, 1, 0),
      new EngineVector3(0, 1, 0),
      new EngineVector3(0, 1, 0),
      new EngineVector3(0, 0, 1),
      new EngineVector3(0, 0, -1),
    ];
  }

  updateMatrices(light: PointLight, viewportIndex: i32 = 0): void {
    const camera = this.camera as PerspectiveCamera;
    const shadowMatrix = this.matrix;

    const far = light.distance || camera.far;

    if (far != camera.far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    _lightPositionWorld.setFromMatrixPosition(light.matrixWorld);
    camera.position.copy(_lightPositionWorld);

    _lookTarget.copy(camera.position);
    _lookTarget.add(this._cubeDirections[viewportIndex]);
    camera.up.copy(this._cubeUps[viewportIndex]);
    camera.lookAt(_lookTarget.x, _lookTarget.y, _lookTarget.z);
    camera.updateMatrixWorld();

    shadowMatrix.makeTranslation(
      -_lightPositionWorld.x,
      -_lightPositionWorld.y,
      -_lightPositionWorld.z
    );

    _projScreenMatrix.multiplyMatricesSIMD(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(_projScreenMatrix);
  }
}
