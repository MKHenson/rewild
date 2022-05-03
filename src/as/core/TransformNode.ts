import { Euler } from "../math/Euler";
import { Matrix4 } from "../math/Matrix4";
import { Matrix3 } from "../math/Matrix3";
import { Quaternion } from "../math/Quaternion";
import { Vector3 } from "../math/Vector3";
import { Event } from "./Event";
import { EventDispatcher } from "./EventDispatcher";
import { Layers } from "./Layers";
import * as MathUtils from "../math/MathUtils";
import { Camera } from "../cameras/Camera";
import { Light } from "../lights/Light";
import { Raycaster } from "./Raycaster";
import { Intersection } from "../objects/Mesh";

let object3DId: i32 = 1;

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

type TraverseCallback = (object: TransformNode) => void;
const _addedEvent: Event = new Event("added");
const _removedEvent: Event = new Event("removed");

export class TransformNode extends EventDispatcher {
  static DefaultUp: Vector3 = new Vector3(0, 1, 0);
  static DefaultMatrixAutoUpdate: boolean = true;

  uuid: string = MathUtils.generateUUID();
  name: string;
  type: string;
  parent: TransformNode | null;
  children: TransformNode[];
  matrix: Matrix4;
  matrixWorld: Matrix4;
  up: Vector3;
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: i32;
  // animations = [];
  // TODO:
  // userData: any;
  matrixAutoUpdate: boolean;
  visible: boolean;
  matrixWorldNeedsUpdate: boolean;
  layers: Layers;

  id: i32 = object3DId++;

  readonly position: Vector3;
  readonly rotation: Euler;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
  readonly modelViewMatrix: Matrix4;
  readonly normalMatrix: Matrix3;

  constructor() {
    super();
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.modelViewMatrix = new Matrix4();
    this.normalMatrix = new Matrix3();

    this.uuid = MathUtils.generateUUID();

    this.name = "";
    this.type = "Object3D";

    this.parent = null;
    this.children = [];

    this.up = TransformNode.DefaultUp.clone();

    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();

    this.matrixAutoUpdate = TransformNode.DefaultMatrixAutoUpdate;
    this.matrixWorldNeedsUpdate = false;

    this.layers = new Layers();
    this.visible = true;

    this.castShadow = false;
    this.receiveShadow = false;

    this.frustumCulled = true;
    this.renderOrder = 0;

    // this.animations = [];

    // this.transform = new Transform();
    this.rotation._onChange(this);
    this.quaternion._onChange(this);
  }

  onEulerChanged(euler: Euler): void {
    this.quaternion.setFromEuler(euler, false);
  }

  onQuatChanged(quat: Quaternion): void {
    this.rotation.setFromQuaternion(quat, Euler.DefaultOrder, false);
  }

  onBeforeRender(): void {}
  onAfterRender(): void {}

  applyMatrix4(matrix: Matrix4): void {
    if (this.matrixAutoUpdate) this.updateMatrix();

    this.matrix.premultiply(matrix);

    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }

  applyQuaternion(q: Quaternion): TransformNode {
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

  rotateOnAxis(axis: Vector3, angle: f32): TransformNode {
    // rotate object on axis in object space
    // axis is assumed to be normalized

    _q1.setFromAxisAngle(axis, angle);

    this.quaternion.multiply(_q1);

    return this;
  }

  rotateOnWorldAxis(axis: Vector3, angle: f32): TransformNode {
    // rotate object on axis in world space
    // axis is assumed to be normalized
    // method assumes no rotated parent

    _q1.setFromAxisAngle(axis, angle);

    this.quaternion.premultiply(_q1);

    return this;
  }

  rotateX(angle: f32): TransformNode {
    return this.rotateOnAxis(_xAxis, angle);
  }

  rotateY(angle: f32): TransformNode {
    return this.rotateOnAxis(_yAxis, angle);
  }

  rotateZ(angle: f32): TransformNode {
    return this.rotateOnAxis(_zAxis, angle);
  }

  translateOnAxis(axis: Vector3, distance: f32): TransformNode {
    // translate object by distance along axis in object space
    // axis is assumed to be normalized

    _v1.copy(axis).applyQuaternion(this.quaternion);

    this.position.add(_v1.multiplyScalar(distance));

    return this;
  }

  translateX(distance: f32): TransformNode {
    return this.translateOnAxis(_xAxis, distance);
  }

  translateY(distance: f32): TransformNode {
    return this.translateOnAxis(_yAxis, distance);
  }

  translateZ(distance: f32): TransformNode {
    return this.translateOnAxis(_zAxis, distance);
  }

  localToWorld(vector: Vector3): Vector3 {
    return vector.applyMatrix4(this.matrixWorld);
  }

  worldToLocal(vector: Vector3): Vector3 {
    return vector.applyMatrix4(_m1.copy(this.matrixWorld).invert());
  }

  lookAt(x: f32, y: f32, z: f32): void {
    // This method does not support objects having non-uniformly-scaled parent(s)

    _target.set(x, y, z);

    const parent = this.parent;

    this.updateWorldMatrix(true, false);

    _position.setFromMatrixPosition(this.matrixWorld);

    if (this instanceof Camera || this instanceof Light) {
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

  add(object: TransformNode): TransformNode {
    if (object === this) throw new Error("Object can't be added as a child of itself.");

    if (object.parent !== null) {
      object.parent!.remove(object);
    }

    object.parent = this;
    this.children.push(object);

    _addedEvent.target = this;
    object.dispatchEvent(_addedEvent);

    return this;
  }

  remove(object: TransformNode): TransformNode {
    const index = this.children.indexOf(object);

    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);

      _removedEvent.target = this;
      object.dispatchEvent(_removedEvent);
    }

    return this;
  }

  removeFromParent(): TransformNode {
    const parent = this.parent;

    if (parent !== null) parent.remove(this);

    return this;
  }

  clear(): TransformNode {
    const children = this.children;
    for (let i = 0; i < children.length; i++) {
      const object = children[i];
      object.parent = null;
      object.dispatchEvent(_removedEvent);
    }

    this.children.length = 0;

    return this;
  }

  attach(object: TransformNode): TransformNode {
    // adds object as a child of this, while maintaining the object's world transform

    this.updateWorldMatrix(true, false);

    _m1.copy(this.matrixWorld).invert();

    const objectParent = object.parent;
    if (objectParent != null) {
      objectParent.updateWorldMatrix(true, false);

      _m1.multiply(objectParent.matrixWorld);
    }

    object.applyMatrix4(_m1);

    this.add(object);

    object.updateWorldMatrix(false, true);

    return this;
  }

  // TODO
  // getObjectById(id: string) {
  //   return this.getObjectByProperty("id", id);
  // }

  // getObjectByName(name: string) {
  //   return this.getObjectByProperty("name", name);
  // }

  // getObjectByProperty(name: string, value) {
  //   if (this[name] === value) return this;

  //   for (let i = 0, l = this.children.length; i < l; i++) {
  //     const child = this.children[i];
  //     const object = child.getObjectByProperty(name, value);

  //     if (object !== undefined) {
  //       return object;
  //     }
  //   }

  //   return undefined;
  // }

  getWorldPosition(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);

    return target.setFromMatrixPosition(this.matrixWorld);
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

    return target.set(e[8], e[9], e[10]).normalize();
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {}

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

    if (parent !== null) {
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
        this.matrixWorld.multiplyMatrices(this.parent!.matrixWorld, this.matrix);
      }

      this.matrixWorldNeedsUpdate = false;

      force = true;
    }

    // update children

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].updateMatrixWorld(force);
    }
  }

  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    const parent = this.parent;

    if (updateParents === true && parent !== null) {
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
  }

  clone(recursive: boolean = false): TransformNode {
    return new TransformNode().copy(this, recursive);
  }

  copy(source: TransformNode, recursive: boolean = true): TransformNode {
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

    this.layers.mask = source.layers.mask;
    this.visible = source.visible;

    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;

    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;

    // TODO:
    // this.userData = JSON.parse(JSON.stringify(source.userData));

    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }

    return this;
  }
}
