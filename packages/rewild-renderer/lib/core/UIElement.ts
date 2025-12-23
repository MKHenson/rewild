import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Intersection, UIRaycaster } from './Raycaster';
import { IComponent, Transform } from './Transform';
import { IMeshComponent, IRaycaster } from '../../types/interfaces';
import { Color, Matrix4, Vector3 } from 'rewild-common';

const _inverseMatrix: Matrix4 = new Matrix4();
const _intersectionPointWorld: Vector3 = new Vector3();

export class UIElement implements IComponent, IMeshComponent {
  geometry: Geometry;
  material: IMaterialPass;
  transform: Transform;
  visible: boolean;
  private _width: f32;
  private _height: f32;
  private _backgroundColor: Color;
  private _backgroundColorAlpha: f32 = 1.0;
  private _borderColor: Color;
  private _borderColorAlpha: f32 = 1.0;
  private _borderRadius: f32 = 0.0;

  constructor(
    geometry: Geometry,
    material: IMaterialPass,
    transform: Transform = new Transform()
  ) {
    this.geometry = geometry;
    this.transform = transform;
    this.visible = true;

    transform.component = this;
    this.backgroundColor = new Color(0.3, 0.3, 0.3);
    this.backgroundColorAlpha = 0.9;
    this.borderColor = new Color(0.1, 0.1, 0.1);
    this.borderColorAlpha = 0.9;
    this.borderRadius = 0.0;

    this.setMaterial(material);
  }

  get borderRadius(): f32 {
    return this._borderRadius;
  }

  set borderRadius(value: f32) {
    this._borderRadius = value;
  }

  get x(): f32 {
    return this.transform.position.x;
  }

  set x(value: f32) {
    this.transform.position.x = value;
  }

  get y(): f32 {
    return this.transform.position.y;
  }

  set y(value: f32) {
    this.transform.position.y = value;
  }

  get z(): f32 {
    return this.transform.position.z;
  }

  set z(value: f32) {
    this.transform.position.z = value;
  }

  get width(): f32 {
    return this._width;
  }

  set width(value: f32) {
    this._width = value;
  }

  get height(): f32 {
    return this._height;
  }

  set height(value: f32) {
    this._height = value;
  }

  get backgroundColor(): Color {
    return this._backgroundColor;
  }

  set backgroundColor(value: Color) {
    this._backgroundColor = value;
  }

  get backgroundColorAlpha(): f32 {
    return this._backgroundColorAlpha;
  }

  set backgroundColorAlpha(value: f32) {
    this._backgroundColorAlpha = value;
  }

  get borderColor(): Color {
    return this._borderColor;
  }

  set borderColor(value: Color) {
    this._borderColor = value;
  }

  get borderColorAlpha(): f32 {
    return this._borderColorAlpha;
  }

  set borderColorAlpha(value: f32) {
    this._borderColorAlpha = value;
  }

  raycast(raycaster: IRaycaster, intersects: Intersection[]) {
    if (raycaster instanceof UIRaycaster) {
      const uiRaycaster = raycaster as UIRaycaster;
      const origin = uiRaycaster.origin;
      const matrixWorld = this.transform.matrixWorld;

      _inverseMatrix.copy(matrixWorld).invert();
      _intersectionPointWorld
        .set(origin.x, origin.y, 0)
        .applyMatrix4(_inverseMatrix);

      const localX = _intersectionPointWorld.x;
      const localY = _intersectionPointWorld.y;

      if (
        localX >= 0 &&
        localX <= this._width &&
        localY >= 0 &&
        localY <= this._height
      ) {
        const intersection = new Intersection();
        intersection.distance = 0;
        intersection.point = origin.clone();
        intersection.object = this.transform;
        intersects.push(intersection);
      }
    }
  }

  setMaterial(material: IMaterialPass) {
    if (this.material) {
      this.material.perMeshTracker?.onUnassignedFromMesh(this);
      this.material.sharedUniformsTracker?.onUnassignedFromMesh(this);
    }

    if (!material.isGeometryCompatible(this.geometry))
      throw new Error('Material is not compatible with geometry');

    this.material = material;
    material.perMeshTracker?.onAssignedToMesh(this);
    material.sharedUniformsTracker?.onAssignedToMesh(this);
  }
}
