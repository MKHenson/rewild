import {
  Quaternion,
  Vector3,
  Euler,
  IEulerChangeListener,
  Matrix3,
  Matrix4,
  IQuatChangeListener,
  Event,
} from 'rewild-common';
import { Intersection, Raycaster } from './Raycaster';
import { Layers } from './Layers';

const _v1 = new Vector3();
const _q1 = new Quaternion();
const _m1 = new Matrix4();
const _target = new Vector3();

const _position = new Vector3();
const _scale = new Vector3();
const _quaternion = new Quaternion();

const _xAxis = new Vector3(1, 0, 0);
const _yAxis = new Vector3(0, 1, 0);
const _zAxis = new Vector3(0, 0, 1);

type TraverseCallback = (object: Transform) => void;
const _addedEvent: Event = new Event('added');
const _removedEvent: Event = new Event('removed');

export interface ITransformObserver {
  worldMatrixUpdated(source: Transform): void;
}

export interface IComponent {
  raycast: (raycaster: Raycaster, intersects: Intersection[]) => void;
}

export class Transform implements IQuatChangeListener, IEulerChangeListener {
  static DefaultMatrixAutoUpdate: boolean = true;
  static DefaultUp: Vector3 = new Vector3(0, 1, 0);

  name: string;
  id: string;
  type: string;
  parent: Transform | null;
  children: Transform[];
  matrix: Matrix4;
  matrixWorld: Matrix4;
  up: Vector3;
  matrixWorldNeedsUpdate: boolean;
  matrixAutoUpdate: boolean;
  visible: boolean = true;
  observers: ITransformObserver[];
  component: IComponent | null;

  readonly position: Vector3;
  readonly rotation: Euler;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
  readonly modelViewMatrix: Matrix4;
  readonly normalMatrix: Matrix3;
  readonly layers: Layers;

  readonly dataProperties: Int32Array;

  constructor() {
    this.dataProperties = new Int32Array(7);

    this.observers = [];
    this.component = null;
    this.layers = new Layers();

    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.modelViewMatrix = new Matrix4();
    this.normalMatrix = new Matrix3();

    this.name = '';
    this.id = '';
    this.type = 'Object3D';

    this.parent = null;
    this.children = [];

    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();

    this.matrixWorldNeedsUpdate = false;

    this.matrixAutoUpdate = true;
    this.up = new Vector3(0, 1, 0);

    this.rotation._onChange(this);
    this.quaternion._onChange(this);
  }

  onEulerChanged(euler: Euler): void {
    this.quaternion.setFromEuler(euler, false);
  }

  onQuatChanged(quat: Quaternion): void {
    this.rotation.setFromQuaternion(quat, Euler.DefaultOrder, false);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    this.component?.raycast(raycaster, intersects);
  }

  applyMatrix4(matrix: Matrix4): void {
    if (this.matrixAutoUpdate) this.updateMatrix();

    this.matrix.premultiply(matrix);

    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }

  applyQuaternion(q: Quaternion): Transform {
    this.quaternion.premultiply(q);

    return this;
  }

  setRotationFromAxisAngle(axis: Vector3, angle: f32): void {
    // assumes axis is normalized

    this.quaternion.setFromAxisAngle(axis, angle);
  }

  setRotationFromEuler(euler: Euler): void {
    this.quaternion.setFromEuler(euler, true);
  }

  setRotationFromMatrix(m: Matrix4): void {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    this.quaternion.setFromRotationMatrix(m);
  }

  setRotationFromQuaternion(q: Quaternion): void {
    // assumes q is normalized

    this.quaternion.copy(q);
  }

  rotateOnAxis(axis: Vector3, angle: f32): Transform {
    // rotate object on axis in object space
    // axis is assumed to be normalized

    _q1.setFromAxisAngle(axis, angle);

    this.quaternion.multiply(_q1);

    return this;
  }

  rotateOnWorldAxis(axis: Vector3, angle: f32): Transform {
    // rotate object on axis in world space
    // axis is assumed to be normalized
    // method assumes no rotated parent

    _q1.setFromAxisAngle(axis, angle);

    this.quaternion.premultiply(_q1);

    return this;
  }

  rotateX(angle: f32): Transform {
    return this.rotateOnAxis(_xAxis, angle);
  }

  rotateY(angle: f32): Transform {
    return this.rotateOnAxis(_yAxis, angle);
  }

  rotateZ(angle: f32): Transform {
    return this.rotateOnAxis(_zAxis, angle);
  }

  translateOnAxis(axis: Vector3, distance: f32): Transform {
    // translate object by distance along axis in object space
    // axis is assumed to be normalized

    _v1.copy(axis).applyQuaternion(this.quaternion);

    this.position.add(_v1.multiplyScalar(distance));

    return this;
  }

  translateX(distance: f32): Transform {
    return this.translateOnAxis(_xAxis, distance);
  }

  translateY(distance: f32): Transform {
    return this.translateOnAxis(_yAxis, distance);
  }

  translateZ(distance: f32): Transform {
    return this.translateOnAxis(_zAxis, distance);
  }

  localToWorld(vector: Vector3): Vector3 {
    return vector.applyMatrix4(this.matrixWorld) as Vector3;
  }

  worldToLocal(vector: Vector3): Vector3 {
    return vector.applyMatrix4(
      (_m1.copy(this.matrixWorld) as Matrix4).invert()
    ) as Vector3;
  }

  /**
   * Rotates object to face the target position.
   * @param x - The x coordinate of the target position.
   * @param y - The y coordinate of the target position.
   * @param z - The z coordinate of the target position.
   * @param lookAtTarget - Whether to look at the target or from the target. NOT SURE WHY THIS IS HERE
   */
  lookAt(x: f32, y: f32, z: f32, lookAtTarget: boolean): void {
    // This method does not support objects having non-uniformly-scaled parent(s)

    _target.set(x, y, z);

    const parent = this.parent;

    this.updateWorldMatrix(true, false);

    _position.setFromMatrixPosition(this.matrixWorld);

    // This used to be a check if it was a camera or light.
    if (lookAtTarget) {
      _m1.lookAt(_position, _target, this.up);
    } else {
      _m1.lookAt(_target, _position, this.up);
    }

    this.quaternion.setFromRotationMatrix(_m1);

    if (parent) {
      _m1.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1);
      this.quaternion.premultiply(_q1.invert());
    }
  }

  removeFromParent(): Transform {
    const parent = this.parent;
    if (parent != null) parent.removeChild(this);

    return this;
  }

  clear(): Transform {
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      const object = children[i];
      object.parent = null;
    }

    this.children.length = 0;

    return this;
  }

  attach(object: Transform): Transform {
    // adds object as a child of this, while maintaining the object's world transform

    this.updateWorldMatrix(true, false);

    (_m1.copy(this.matrixWorld) as Matrix4).invert();

    const objectParent = object.parent;
    if (objectParent != null) {
      objectParent.updateWorldMatrix(true, false);

      _m1.multiply(objectParent.matrixWorld);
    }

    object.applyMatrix4(_m1);

    this.addChild(object);

    object.updateWorldMatrix(false, true);

    return this;
  }

  getWorldPosition(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);

    return target.setFromMatrixPosition(this.matrixWorld) as Vector3;
  }

  getWorldQuaternion(target: Quaternion): Quaternion {
    this.updateWorldMatrix(true, false);

    this.matrixWorld.decompose(_position, target, _scale);

    return target;
  }

  getWorldScale(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);

    this.matrixWorld.decompose(_position, _quaternion, target);

    return target;
  }

  getWorldDirection(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);

    const e = this.matrixWorld.elements;

    return target.set(e[8], e[9], e[10]).normalize() as Vector3;
  }

  traverse(callback: TraverseCallback): void {
    callback(this);

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }

  traverseVisible(callback: TraverseCallback): void {
    if (this.visible === false) return;

    callback(this);

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }

  traverseAncestors(callback: TraverseCallback): void {
    const parent = this.parent;

    if (parent != null) {
      callback(parent);

      parent.traverseAncestors(callback);
    }
  }

  updateMatrix(): void {
    this.matrix.compose(this.position, this.quaternion, this.scale);

    this.matrixWorldNeedsUpdate = true;
  }

  updateMatrixWorld(force: boolean = false): void {
    if (this.matrixAutoUpdate) this.updateMatrix();

    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(
          this.parent!.matrixWorld,
          this.matrix
        );
      }

      this.matrixWorldNeedsUpdate = false;

      force = true;
    }

    // update children

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].updateMatrixWorld(force);
    }

    const attachments = this.observers;
    for (let i = 0, l = attachments.length; i < l; i++) {
      attachments[i].worldMatrixUpdated(this);
    }
  }

  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    const parent = this.parent;

    if (updateParents === true && parent != null) {
      parent.updateWorldMatrix(true, false);
    }

    if (this.matrixAutoUpdate) this.updateMatrix();

    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      this.matrixWorld.multiplyMatrices(this.parent!.matrixWorld, this.matrix);
    }

    // update children

    if (updateChildren === true) {
      const children = this.children;

      for (let i = 0, l = children.length; i < l; i++) {
        children[i].updateWorldMatrix(false, true);
      }
    }

    const attachments = this.observers;
    for (let i = 0, l = attachments.length; i < l; i++) {
      attachments[i].worldMatrixUpdated(this);
    }
  }

  clone(recursive: boolean = false): Transform {
    return new Transform().copy(this, recursive);
  }

  copy(source: Transform, recursive: boolean = true): Transform {
    this.name = source.name;

    this.up.copy(source.up);

    this.position.copy(source.position);
    this.rotation.order = source.rotation.order;
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);

    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);

    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;

    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.addChild(child.clone());
      }
    }

    return this;
  }

  onDispose(): void {}

  addChild(child: Transform): Transform {
    if (child === this)
      throw new Error("Transform can't be added as a child of itself.");

    if (child.parent != null) {
      this.removeChild(child);
    }

    child.parent = this;
    this.children.push(child);

    _addedEvent.target = parent;
    return this;
  }

  removeChild(child: Transform): Transform {
    const index = this.children.indexOf(child);

    if (index != -1) {
      child.parent = null;
      this.children.splice(index, 1);

      _removedEvent.target = this;
    }

    return this;
  }
}
