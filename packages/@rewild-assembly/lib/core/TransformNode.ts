import { Euler, IEulerChangeListener, Matrix3, Quaternion, IQuatChangeListener } from "@rewild/Common";
import { EngineMatrix4 } from "../math/Matrix4";
import { EngineVector3 } from "../math/Vector3";
import { Event } from "./Event";
import { EventDispatcher } from "./EventDispatcher";
import { Layers } from "./Layers";
import { Camera } from "../cameras/Camera";
import { Light } from "../lights/Light";
import { Raycaster } from "./Raycaster";
import { Intersection, MeshComponent } from "../components/MeshComponent";
import { Component } from "./Component";

const _v1 = new EngineVector3();
const _q1 = new Quaternion();
const _m1 = new EngineMatrix4();
const _target = new EngineVector3();

const _position = new EngineVector3();
const _scale = new EngineVector3();
const _quaternion = new Quaternion();

const _xAxis = new EngineVector3(1, 0, 0);
const _yAxis = new EngineVector3(0, 1, 0);
const _zAxis = new EngineVector3(0, 0, 1);

type TraverseCallback = (object: TransformNode) => void;
const _addedEvent: Event = new Event("added");
const _removedEvent: Event = new Event("removed");

export class TransformNode extends EventDispatcher implements IQuatChangeListener, IEulerChangeListener {
  static DefaultUp: EngineVector3 = new EngineVector3(0, 1, 0);
  static DefaultMatrixAutoUpdate: boolean = true;

  name: string;
  type: string;
  parent: TransformNode | null;
  children: TransformNode[];
  matrix: EngineMatrix4;
  matrixWorld: EngineMatrix4;
  up: EngineVector3;
  matrixWorldNeedsUpdate: boolean;
  layers: Layers;

  readonly position: EngineVector3;
  readonly rotation: Euler;
  readonly quaternion: Quaternion;
  readonly scale: EngineVector3;
  readonly modelViewMatrix: EngineMatrix4;
  readonly normalMatrix: Matrix3;

  readonly dataProperties: Int32Array;
  readonly components: Component[];

  constructor() {
    super();

    this.dataProperties = new Int32Array(7);

    this.components = [];
    this.id = 0;
    this.position = new EngineVector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new EngineVector3(1, 1, 1);
    this.modelViewMatrix = new EngineMatrix4();
    this.normalMatrix = new Matrix3();

    this.name = "";
    this.type = "Object3D";

    this.parent = null;
    this.children = [];

    this.up = TransformNode.DefaultUp.clone();

    this.matrix = new EngineMatrix4();
    this.matrixWorld = new EngineMatrix4();

    this.matrixAutoUpdate = TransformNode.DefaultMatrixAutoUpdate;
    this.matrixWorldNeedsUpdate = false;

    this.layers = new Layers();
    this.visible = true;

    this.castShadow = false;
    this.receiveShadow = false;

    this.frustumCulled = true;
    this.renderOrder = 0;

    // this.animations = [];

    this.rotation._onChange(this);
    this.quaternion._onChange(this);
  }

  get visible(): boolean {
    return unchecked(this.dataProperties[0]) === 0 ? false : true;
  }
  set visible(val: boolean) {
    unchecked((this.dataProperties[0] = val ? 1 : 0));
  }

  get renderOrder(): i32 {
    return unchecked(this.dataProperties[1]);
  }
  set renderOrder(val: i32) {
    unchecked(this.dataProperties[1]);
  }

  get frustumCulled(): boolean {
    return unchecked(this.dataProperties[2] === 0 ? false : true);
  }
  set frustumCulled(val: boolean) {
    unchecked((this.dataProperties[2] = val ? 1 : 0));
  }

  get matrixAutoUpdate(): boolean {
    return unchecked(this.dataProperties[3] === 0 ? false : true);
  }
  set matrixAutoUpdate(val: boolean) {
    unchecked((this.dataProperties[3] = val ? 1 : 0));
  }

  get castShadow(): boolean {
    return unchecked(this.dataProperties[4] === 0 ? false : true);
  }
  set castShadow(val: boolean) {
    unchecked((this.dataProperties[4] = val ? 1 : 0));
  }

  get receiveShadow(): boolean {
    return unchecked(this.dataProperties[5] === 0 ? false : true);
  }
  set receiveShadow(val: boolean) {
    unchecked((this.dataProperties[5] = val ? 1 : 0));
  }

  get id(): i32 {
    return unchecked(this.dataProperties[6]);
  }
  set id(val: i32) {
    unchecked((this.dataProperties[6] = val));
  }

  onEulerChanged(euler: Euler): void {
    this.quaternion.setFromEuler(euler, false);
  }

  onQuatChanged(quat: Quaternion): void {
    this.rotation.setFromQuaternion(quat, Euler.DefaultOrder, false);
  }

  onBeforeRender(): void {}
  onAfterRender(): void {}

  applyMatrix4(matrix: EngineMatrix4): void {
    if (this.matrixAutoUpdate) this.updateMatrix();

    this.matrix.premultiply(matrix);

    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }

  applyQuaternion(q: Quaternion): TransformNode {
    this.quaternion.premultiply(q);

    return this;
  }

  setRotationFromAxisAngle(axis: EngineVector3, angle: f32): void {
    // assumes axis is normalized

    this.quaternion.setFromAxisAngle(axis, angle);
  }

  setRotationFromEuler(euler: Euler): void {
    this.quaternion.setFromEuler(euler, true);
  }

  setRotationFromMatrix(m: EngineMatrix4): void {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

    this.quaternion.setFromRotationMatrix(m);
  }

  setRotationFromQuaternion(q: Quaternion): void {
    // assumes q is normalized

    this.quaternion.copy(q);
  }

  rotateOnAxis(axis: EngineVector3, angle: f32): TransformNode {
    // rotate object on axis in object space
    // axis is assumed to be normalized

    _q1.setFromAxisAngle(axis, angle);

    this.quaternion.multiply(_q1);

    return this;
  }

  rotateOnWorldAxis(axis: EngineVector3, angle: f32): TransformNode {
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

  translateOnAxis(axis: EngineVector3, distance: f32): TransformNode {
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

  localToWorld(vector: EngineVector3): EngineVector3 {
    return vector.applyMatrix4(this.matrixWorld) as EngineVector3;
  }

  worldToLocal(vector: EngineVector3): EngineVector3 {
    return vector.applyMatrix4(_m1.copy(this.matrixWorld).invertSIMD()) as EngineVector3;
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

  removeFromParent(): TransformNode {
    const parent = this.parent;
    if (parent != null) removeChild(parent, this);

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

    _m1.copy(this.matrixWorld).invertSIMD();

    const objectParent = object.parent;
    if (objectParent != null) {
      objectParent.updateWorldMatrix(true, false);

      _m1.multiplySIMD(objectParent.matrixWorld);
    }

    object.applyMatrix4(_m1);

    addChild(this, object);

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

  //     if (object != undefined) {
  //       return object;
  //     }
  //   }

  //   return undefined;
  // }

  getWorldPosition(target: EngineVector3): EngineVector3 {
    this.updateWorldMatrix(true, false);

    return target.setFromMatrixPosition(this.matrixWorld) as EngineVector3;
  }

  getWorldQuaternion(target: Quaternion): Quaternion {
    this.updateWorldMatrix(true, false);

    this.matrixWorld.decompose(_position, target, _scale);

    return target;
  }

  getWorldScale(target: EngineVector3): EngineVector3 {
    this.updateWorldMatrix(true, false);

    this.matrixWorld.decompose(_position, _quaternion, target);

    return target;
  }

  getWorldDirection(target: EngineVector3): EngineVector3 {
    this.updateWorldMatrix(true, false);

    const e = this.matrixWorld.elements;

    return target.set(e[8], e[9], e[10]).normalize() as EngineVector3;
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    const components = this.components;
    for (let i: i32 = 0, l = components.length; i < l; i++) {
      const component = unchecked(components[i]);
      if (component instanceof MeshComponent) component.raycast(raycaster, intersects);
    }
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
        this.matrixWorld.multiplyMatricesSIMD(this.parent!.matrixWorld, this.matrix);
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

    if (updateParents === true && parent != null) {
      parent.updateWorldMatrix(true, false);
    }

    if (this.matrixAutoUpdate) this.updateMatrix();

    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      this.matrixWorld.multiplyMatricesSIMD(this.parent!.matrixWorld, this.matrix);
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
        addChild(this, child.clone());
      }
    }

    return this;
  }
}

export function createTransformNode(name: string | null): TransformNode {
  const toReturn = new TransformNode();
  if (name) toReturn.name = name;
  return toReturn;
}

export function addChild(parent: TransformNode, child: TransformNode): TransformNode {
  if (child === parent) throw new Error("Transform can't be added as a child of itself.");

  if (child.parent != null) {
    removeChild(child.parent!, child);
  }

  child.parent = parent;
  parent.children.push(child);

  _addedEvent.target = parent;
  child.dispatchEvent(_addedEvent);

  return parent;
}

export function getVisibility(node: TransformNode): boolean {
  return node.visible;
}

export function setVisibility(node: TransformNode, value: boolean): void {
  node.visible = value;
}

export function getId(node: TransformNode): i32 {
  return node.id;
}

export function setId(node: TransformNode, value: i32): TransformNode {
  node.id = value;
  return node;
}

export function getDataProperties(node: TransformNode): usize {
  return changetype<usize>(node.dataProperties);
}

export function addComponent(node: TransformNode, component: Component): TransformNode {
  if (component.transform) {
    component.transform!.components.splice(component.transform!.components.indexOf(component), 1);
  }

  node.components.push(component);
  component.transform = node;
  return node;
}

export function removeChild(parent: TransformNode, child: TransformNode): TransformNode {
  const index = parent.children.indexOf(child);

  if (index != -1) {
    child.parent = null;
    parent.children.splice(index, 1);

    _removedEvent.target = parent;
    child.dispatchEvent(_removedEvent);
  }

  return parent;
}

export function getTransformModelViewMatrix(node: TransformNode): usize {
  return changetype<usize>(node.modelViewMatrix.elements);
}
export function getTransformWorldMatrix(node: TransformNode): usize {
  return changetype<usize>(node.matrixWorld.elements);
}
export function getTransformNormalMatrix(node: TransformNode): usize {
  return changetype<usize>(node.normalMatrix.elements);
}
