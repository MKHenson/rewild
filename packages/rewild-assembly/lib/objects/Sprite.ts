import { EngineVector2 } from '../math/Vector2';
import { EngineVector3 } from '../math/Vector3';
import { EngineMatrix4 } from '../math/EngineMatrix4';
import { Triangle, AttributeType } from 'rewild-common';
import { TransformNode } from '../core/TransformNode';
import { BufferGeometry } from '../core/BufferGeometry';
import { InterleavedBuffer } from '../core/InterleavedBuffer';
import { InterleavedBufferAttribute } from '../core/InterleavedBufferAttribute';
import { SpriteMaterial } from '../materials/SpriteMaterial';
import { f32Array } from '../utils';
import { Raycaster } from '../core/Raycaster';
import { Intersection } from '../components/MeshComponent';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera';
import { ASError } from '../core/Error';

let _geometry: BufferGeometry | null = null;

const _tempVec2 = new EngineVector2();
const _intersectPoint = new EngineVector3();
const _worldScale = new EngineVector3();
const _mvPosition = new EngineVector3();

const _alignedPosition = new EngineVector2();
const _rotatedPosition = new EngineVector2();
const _viewWorldMatrix = new EngineMatrix4();

const _vA = new EngineVector3();
const _vB = new EngineVector3();
const _vC = new EngineVector3();

const _uvA = new EngineVector2();
const _uvB = new EngineVector2();
const _uvC = new EngineVector2();

export class Sprite extends TransformNode {
  geometry: BufferGeometry;
  material: SpriteMaterial;
  center: EngineVector2;

  constructor(material: SpriteMaterial) {
    super();

    this.type = 'Sprite';

    if (_geometry == null) {
      _geometry = new BufferGeometry();

      const float32Array = f32Array([
        -0.5, -0.5, 0, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 1, 1, -0.5, 0.5,
        0, 0, 1,
      ]);

      const interleavedBuffer = new InterleavedBuffer(float32Array, 5);

      _geometry.setIndexes([0, 1, 2, 0, 2, 3]);
      _geometry.setAttribute(
        AttributeType.POSITION,
        new InterleavedBufferAttribute(interleavedBuffer, 3, 0, false)
      );
      _geometry.setAttribute(
        AttributeType.UV,
        new InterleavedBufferAttribute(interleavedBuffer, 2, 3, false)
      );
    }

    this.geometry = _geometry;
    this.material = material != undefined ? material : new SpriteMaterial();

    this.center = new EngineVector2(0.5, 0.5);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (raycaster.camera === null) {
      throw new ASError(
        'Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'
      );
    }

    _worldScale.setFromMatrixScale(this.matrixWorld);

    _viewWorldMatrix.copy(raycaster.camera!.matrixWorld);
    this.modelViewMatrix.multiplyMatricesSIMD(
      raycaster.camera!.matrixWorldInverse,
      this.matrixWorld
    );

    _mvPosition.setFromMatrixPosition(this.modelViewMatrix);

    if (
      raycaster.camera! instanceof PerspectiveCamera &&
      this.material.sizeAttenuation === false
    ) {
      _worldScale.multiplyScalar(-_mvPosition.z);
    }

    const rotation: f32 = this.material.rotation;
    let sin: f32 = 0,
      cos: f32 = 0;

    if (rotation != 0) {
      cos = Mathf.cos(rotation);
      sin = Mathf.sin(rotation);
    }

    const center = this.center;

    transformVertex(
      _vA.set(-0.5, -0.5, 0) as EngineVector3,
      _mvPosition,
      center,
      _worldScale,
      sin,
      cos
    );
    transformVertex(
      _vB.set(0.5, -0.5, 0) as EngineVector3,
      _mvPosition,
      center,
      _worldScale,
      sin,
      cos
    );
    transformVertex(
      _vC.set(0.5, 0.5, 0) as EngineVector3,
      _mvPosition,
      center,
      _worldScale,
      sin,
      cos
    );

    _uvA.set(0, 0);
    _uvB.set(1, 0);
    _uvC.set(1, 1);

    // check first triangle
    let intersect = raycaster.ray.intersectTriangle(
      _vA,
      _vB,
      _vC,
      false,
      _intersectPoint
    );

    if (intersect === null) {
      // check second triangle
      transformVertex(
        _vB.set(-0.5, 0.5, 0) as EngineVector3,
        _mvPosition,
        center,
        _worldScale,
        sin,
        cos
      );
      _uvB.set(0, 1);

      intersect = raycaster.ray.intersectTriangle(
        _vA,
        _vC,
        _vB,
        false,
        _intersectPoint
      );
      if (intersect === null) {
        return;
      }
    }

    const distance = raycaster.ray.origin.distanceTo(_intersectPoint);

    if (distance < raycaster.near || distance > raycaster.far) return;

    intersects.push({
      distance: distance,
      point: _intersectPoint.clone(),
      uv: Triangle.getUV(
        _intersectPoint,
        _vA,
        _vB,
        _vC,
        _uvA,
        _uvB,
        _uvC,
        new EngineVector2()
      ) as EngineVector2,
      face: null,
      object: this,
      faceIndex: -1,
      uv2: null,
      instanceId: -1,
    });
  }

  copy(source: Sprite): Sprite {
    super.copy(source);

    if (source.center != undefined) this.center.copy(source.center);

    this.material = source.material;

    return this;
  }
}

function transformVertex(
  vertexPosition: EngineVector3,
  mvPosition: EngineVector3,
  center: EngineVector2,
  scale: EngineVector3,
  sin: f32,
  cos: f32
): void {
  // compute position in camera space
  _alignedPosition
    .subVectors(_tempVec2.set(vertexPosition.x, vertexPosition.y), center)
    .addScalar(0.5)
    .multiply(_tempVec2.set(scale.x, scale.y));

  // to check if rotation is not zero
  if (sin != undefined) {
    _rotatedPosition.x = cos * _alignedPosition.x - sin * _alignedPosition.y;
    _rotatedPosition.y = sin * _alignedPosition.x + cos * _alignedPosition.y;
  } else {
    _rotatedPosition.copy(_alignedPosition);
  }

  vertexPosition.copy(mvPosition);
  vertexPosition.x += _rotatedPosition.x;
  vertexPosition.y += _rotatedPosition.y;

  // transform to world space
  vertexPosition.applyMatrix4(_viewWorldMatrix);
}
