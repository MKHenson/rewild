// import { Quaternion } from "../math/Quaternion.js";
// import { Vector3 } from "../math/Vector3.js";
// import { Matrix4 } from "../math/Matrix4.js";
// import { EventDispatcher } from "./EventDispatcher.js";
// import { Euler } from "../math/Euler.js";
// import { Layers } from "./Layers.js";
// import { Matrix3 } from "../math/Matrix3.js";
// import * as MathUtils from "../math/MathUtils.js";
// import { Event } from "./Event.js";
// import { Camera } from "../cameras/Camera.js";
// import { Light } from "../lights/Light.js";

// type TraverseCallback = (object: Object3D) => void;

// let _object3DId = 0;

// const _v1 = new Vector3();
// const _q1 = new Quaternion();
// const _m1 = new Matrix4();
// const _target = new Vector3();

// const _position = new Vector3();
// const _scale = new Vector3();
// const _quaternion = new Quaternion();

// const _xAxis = new Vector3(1, 0, 0);
// const _yAxis = new Vector3(0, 1, 0);
// const _zAxis = new Vector3(0, 0, 1);

// const _addedEvent = { type: "added" };
// const _removedEvent = { type: "removed" };

// export class Object3D extends EventDispatcher {
//   static DefaultUp: Vector3 = new Vector3(0, 1, 0);
//   static DefaultMatrixAutoUpdate: boolean = true;
//   isObject3D: boolean = true;

//   uuid = MathUtils.generateUUID();
//   name: string;
//   type: string;
//   parent: Object3D | null;
//   children: Object3D[];
//   matrix: Matrix4;
//   matrixWorld: Matrix4;
//   up: Vector3;
//   castShadow: boolean;
//   receiveShadow: boolean;
//   frustumCulled: boolean;
//   renderOrder: u32;
//   animations = [];
//   // TODO:
//   // userData: any;
//   matrixAutoUpdate: boolean;
//   visible: boolean;
//   matrixWorldNeedsUpdate: boolean;
//   layers: Layers;

//   id = _object3DId++;

//   readonly position: Vector3 = new Vector3();
//   readonly rotation: Euler = new Euler();
//   readonly quaternion: Quaternion = new Quaternion();
//   readonly scale: Vector3 = new Vector3(1, 1, 1);
//   readonly modelViewMatrix: Matrix4 = new Matrix4();
//   readonly normalMatrix: Matrix4 = new Matrix4();

//   addEvent: Event = new Event("added");
//   removeEvent: Event = new Event("removed");

//   constructor() {
//     super();

//     this.uuid = MathUtils.generateUUID();

//     this.name = "";
//     this.type = "Object3D";

//     this.parent = null;
//     this.children = [];

//     this.up = Object3D.DefaultUp.clone();

//     const rotation = this.rotation;
//     const quaternion = this.quaternion;

//     function onRotationChange() {
//       quaternion.setFromEuler(rotation, false);
//     }

//     function onQuaternionChange() {
//       rotation.setFromQuaternion(quaternion, null, false);
//     }

//     rotation._onChange(onRotationChange);
//     quaternion._onChange(onQuaternionChange);

//     this.matrix = new Matrix4();
//     this.matrixWorld = new Matrix4();

//     this.matrixAutoUpdate = Object3D.DefaultMatrixAutoUpdate;
//     this.matrixWorldNeedsUpdate = false;

//     this.layers = new Layers();
//     this.visible = true;

//     this.castShadow = false;
//     this.receiveShadow = false;

//     this.frustumCulled = true;
//     this.renderOrder = 0;

//     this.animations = [];

//     // TODO:
//     // this.userData = {};
//   }

//   onBeforeRender() {}
//   onAfterRender() {}

//   applyMatrix4(matrix: Matrix4) {
//     if (this.matrixAutoUpdate) this.updateMatrix();

//     this.matrix.premultiply(matrix);

//     this.matrix.decompose(this.position, this.quaternion, this.scale);
//   }

//   applyQuaternion(q: Quaternion) {
//     this.quaternion.premultiply(q);

//     return this;
//   }

//   setRotationFromAxisAngle(axis: Vector3, angle: f32) {
//     // assumes axis is normalized

//     this.quaternion.setFromAxisAngle(axis, angle);
//   }

//   setRotationFromEuler(euler: Euler) {
//     this.quaternion.setFromEuler(euler, true);
//   }

//   setRotationFromMatrix(m: Matrix4) {
//     // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

//     this.quaternion.setFromRotationMatrix(m);
//   }

//   setRotationFromQuaternion(q: Quaternion) {
//     // assumes q is normalized

//     this.quaternion.copy(q);
//   }

//   rotateOnAxis(axis: Vector3, angle: f32) {
//     // rotate object on axis in object space
//     // axis is assumed to be normalized

//     _q1.setFromAxisAngle(axis, angle);

//     this.quaternion.multiply(_q1);

//     return this;
//   }

//   rotateOnWorldAxis(axis: Vector3, angle: f32) {
//     // rotate object on axis in world space
//     // axis is assumed to be normalized
//     // method assumes no rotated parent

//     _q1.setFromAxisAngle(axis, angle);

//     this.quaternion.premultiply(_q1);

//     return this;
//   }

//   rotateX(angle: f32) {
//     return this.rotateOnAxis(_xAxis, angle);
//   }

//   rotateY(angle: f32) {
//     return this.rotateOnAxis(_yAxis, angle);
//   }

//   rotateZ(angle: f32) {
//     return this.rotateOnAxis(_zAxis, angle);
//   }

//   translateOnAxis(axis: Vector3, distance: f32) {
//     // translate object by distance along axis in object space
//     // axis is assumed to be normalized

//     _v1.copy(axis).applyQuaternion(this.quaternion);

//     this.position.add(_v1.multiplyScalar(distance));

//     return this;
//   }

//   translateX(distance: f32) {
//     return this.translateOnAxis(_xAxis, distance);
//   }

//   translateY(distance: f32) {
//     return this.translateOnAxis(_yAxis, distance);
//   }

//   translateZ(distance: f32) {
//     return this.translateOnAxis(_zAxis, distance);
//   }

//   localToWorld(vector: Vector3) {
//     return vector.applyMatrix4(this.matrixWorld);
//   }

//   worldToLocal(vector: Vector3) {
//     return vector.applyMatrix4(_m1.copy(this.matrixWorld).invert());
//   }

//   lookAt(x: f32, y: f32, z: f32) {
//     // This method does not support objects having non-uniformly-scaled parent(s)

//     _target.set(x, y, z);

//     const parent = this.parent;

//     this.updateWorldMatrix(true, false);

//     _position.setFromMatrixPosition(this.matrixWorld);

//     if (this instanceof Camera || this instanceof Light) {
//       _m1.lookAt(_position, _target, this.up);
//     } else {
//       _m1.lookAt(_target, _position, this.up);
//     }

//     this.quaternion.setFromRotationMatrix(_m1);

//     if (parent) {
//       _m1.extractRotation(parent.matrixWorld);
//       _q1.setFromRotationMatrix(_m1);
//       this.quaternion.premultiply(_q1.invert());
//     }
//   }

//   add(object: Object3D) {
//     if (object === this) {
//       throw new Error(
//         "THREE.Object3D.add: object can't be added as a child of itself."
//       );
//     }

//     if (object && object.isObject3D) {
//       if (object.parent !== null) {
//         object.parent.remove(object);
//       }

//       object.parent = this;
//       this.children.push(object);

//       this.addEvent.target = object;
//       object.dispatchEvent(this.addEvent);
//     }

//     return this;
//   }

//   remove(object: Object3D) {
//     const index = this.children.indexOf(object);

//     if (index !== -1) {
//       object.parent = null;
//       this.children.splice(index, 1);

//       this.removeEvent.target = object;
//       object.dispatchEvent(this.removeEvent);
//     }

//     return this;
//   }

//   removeFromParent() {
//     const parent = this.parent;

//     if (parent !== null) {
//       parent.remove(this);
//     }

//     return this;
//   }

//   clear() {
//     for (let i = 0; i < this.children.length; i++) {
//       const object = this.children[i];

//       object.parent = null;

//       this.removeEvent.target = object;
//       object.dispatchEvent(this.removeEvent);
//     }

//     this.children.length = 0;

//     return this;
//   }

//   attach(object: Object3D) {
//     // adds object as a child of this, while maintaining the object's world transform

//     this.updateWorldMatrix(true, false);

//     _m1.copy(this.matrixWorld).invert();

//     if (object.parent !== null) {
//       object.parent.updateWorldMatrix(true, false);

//       _m1.multiply(object.parent.matrixWorld);
//     }

//     object.applyMatrix4(_m1);

//     this.add(object);

//     object.updateWorldMatrix(false, true);

//     return this;
//   }

//   // TODO
//   // getObjectById(id: string) {
//   //   return this.getObjectByProperty("id", id);
//   // }

//   // getObjectByName(name: string) {
//   //   return this.getObjectByProperty("name", name);
//   // }

//   // getObjectByProperty(name: string, value) {
//   //   if (this[name] === value) return this;

//   //   for (let i = 0, l = this.children.length; i < l; i++) {
//   //     const child = this.children[i];
//   //     const object = child.getObjectByProperty(name, value);

//   //     if (object !== undefined) {
//   //       return object;
//   //     }
//   //   }

//   //   return undefined;
//   // }

//   getWorldPosition(target: Vector3) {
//     this.updateWorldMatrix(true, false);

//     return target.setFromMatrixPosition(this.matrixWorld);
//   }

//   getWorldQuaternion(target: Quaternion) {
//     this.updateWorldMatrix(true, false);

//     this.matrixWorld.decompose(_position, target, _scale);

//     return target;
//   }

//   getWorldScale(target: Vector3) {
//     this.updateWorldMatrix(true, false);

//     this.matrixWorld.decompose(_position, _quaternion, target);

//     return target;
//   }

//   getWorldDirection(target: Vector3) {
//     this.updateWorldMatrix(true, false);

//     const e = this.matrixWorld.elements;

//     return target.set(e[8], e[9], e[10]).normalize();
//   }

//   raycast() {}

//   traverse(callback: TraverseCallback) {
//     callback(this);

//     const children = this.children;

//     for (let i = 0, l = children.length; i < l; i++) {
//       children[i].traverse(callback);
//     }
//   }

//   traverseVisible(callback: TraverseCallback) {
//     if (this.visible === false) return;

//     callback(this);

//     const children = this.children;

//     for (let i = 0, l = children.length; i < l; i++) {
//       children[i].traverseVisible(callback);
//     }
//   }

//   traverseAncestors(callback: TraverseCallback) {
//     const parent = this.parent;

//     if (parent !== null) {
//       callback(parent);

//       parent.traverseAncestors(callback);
//     }
//   }

//   updateMatrix() {
//     this.matrix.compose(this.position, this.quaternion, this.scale);

//     this.matrixWorldNeedsUpdate = true;
//   }

//   updateMatrixWorld(force: boolean = false) {
//     if (this.matrixAutoUpdate) this.updateMatrix();

//     if (this.matrixWorldNeedsUpdate || force) {
//       if (this.parent === null) {
//         this.matrixWorld.copy(this.matrix);
//       } else {
//         this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
//       }

//       this.matrixWorldNeedsUpdate = false;

//       force = true;
//     }

//     // update children

//     const children = this.children;

//     for (let i = 0, l = children.length; i < l; i++) {
//       children[i].updateMatrixWorld(force);
//     }
//   }

//   updateWorldMatrix(updateParents: boolean, updateChildren: boolean) {
//     const parent = this.parent;

//     if (updateParents === true && parent !== null) {
//       parent.updateWorldMatrix(true, false);
//     }

//     if (this.matrixAutoUpdate) this.updateMatrix();

//     if (this.parent === null) {
//       this.matrixWorld.copy(this.matrix);
//     } else {
//       this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
//     }

//     // update children

//     if (updateChildren === true) {
//       const children = this.children;

//       for (let i = 0, l = children.length; i < l; i++) {
//         children[i].updateWorldMatrix(false, true);
//       }
//     }
//   }

//   // TODO:
//   // toJSON(meta) {
//   //   // meta is a string when called from JSON.stringify
//   //   const isRootObject = meta === undefined || typeof meta === "string";

//   //   const output = {};

//   //   // meta is a hash used to collect geometries, materials.
//   //   // not providing it implies that this is the root object
//   //   // being serialized.
//   //   if (isRootObject) {
//   //     // initialize meta obj
//   //     meta = {
//   //       geometries: {},
//   //       materials: {},
//   //       textures: {},
//   //       images: {},
//   //       shapes: {},
//   //       skeletons: {},
//   //       animations: {},
//   //     };

//   //     output.metadata = {
//   //       version: 4.5,
//   //       type: "Object",
//   //       generator: "Object3D.toJSON",
//   //     };
//   //   }

//   //   // standard Object3D serialization

//   //   const object = {};

//   //   object.uuid = this.uuid;
//   //   object.type = this.type;

//   //   if (this.name !== "") object.name = this.name;
//   //   if (this.castShadow === true) object.castShadow = true;
//   //   if (this.receiveShadow === true) object.receiveShadow = true;
//   //   if (this.visible === false) object.visible = false;
//   //   if (this.frustumCulled === false) object.frustumCulled = false;
//   //   if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
//   //   if (JSON.stringify(this.userData) !== "{}") object.userData = this.userData;

//   //   object.layers = this.layers.mask;
//   //   object.matrix = this.matrix.toArray();

//   //   if (this.matrixAutoUpdate === false) object.matrixAutoUpdate = false;

//   //   // object specific properties

//   //   if (this.isInstancedMesh) {
//   //     object.type = "InstancedMesh";
//   //     object.count = this.count;
//   //     object.instanceMatrix = this.instanceMatrix.toJSON();
//   //     if (this.instanceColor !== null)
//   //       object.instanceColor = this.instanceColor.toJSON();
//   //   }

//   //   //

//   //   function serialize(library, element) {
//   //     if (library[element.uuid] === undefined) {
//   //       library[element.uuid] = element.toJSON(meta);
//   //     }

//   //     return element.uuid;
//   //   }

//   //   if (this.isMesh || this.isLine || this.isPoints) {
//   //     object.geometry = serialize(meta.geometries, this.geometry);

//   //     const parameters = this.geometry.parameters;

//   //     if (parameters !== undefined && parameters.shapes !== undefined) {
//   //       const shapes = parameters.shapes;

//   //       if (Array.isArray(shapes)) {
//   //         for (let i = 0, l = shapes.length; i < l; i++) {
//   //           const shape = shapes[i];

//   //           serialize(meta.shapes, shape);
//   //         }
//   //       } else {
//   //         serialize(meta.shapes, shapes);
//   //       }
//   //     }
//   //   }

//   //   if (this.isSkinnedMesh) {
//   //     object.bindMode = this.bindMode;
//   //     object.bindMatrix = this.bindMatrix.toArray();

//   //     if (this.skeleton !== undefined) {
//   //       serialize(meta.skeletons, this.skeleton);

//   //       object.skeleton = this.skeleton.uuid;
//   //     }
//   //   }

//   //   if (this.material !== undefined) {
//   //     if (Array.isArray(this.material)) {
//   //       const uuids = [];

//   //       for (let i = 0, l = this.material.length; i < l; i++) {
//   //         uuids.push(serialize(meta.materials, this.material[i]));
//   //       }

//   //       object.material = uuids;
//   //     } else {
//   //       object.material = serialize(meta.materials, this.material);
//   //     }
//   //   }

//   //   //

//   //   if (this.children.length > 0) {
//   //     object.children = [];

//   //     for (let i = 0; i < this.children.length; i++) {
//   //       object.children.push(this.children[i].toJSON(meta).object);
//   //     }
//   //   }

//   //   //

//   //   if (this.animations.length > 0) {
//   //     object.animations = [];

//   //     for (let i = 0; i < this.animations.length; i++) {
//   //       const animation = this.animations[i];

//   //       object.animations.push(serialize(meta.animations, animation));
//   //     }
//   //   }

//   //   if (isRootObject) {
//   //     const geometries = extractFromCache(meta.geometries);
//   //     const materials = extractFromCache(meta.materials);
//   //     const textures = extractFromCache(meta.textures);
//   //     const images = extractFromCache(meta.images);
//   //     const shapes = extractFromCache(meta.shapes);
//   //     const skeletons = extractFromCache(meta.skeletons);
//   //     const animations = extractFromCache(meta.animations);

//   //     if (geometries.length > 0) output.geometries = geometries;
//   //     if (materials.length > 0) output.materials = materials;
//   //     if (textures.length > 0) output.textures = textures;
//   //     if (images.length > 0) output.images = images;
//   //     if (shapes.length > 0) output.shapes = shapes;
//   //     if (skeletons.length > 0) output.skeletons = skeletons;
//   //     if (animations.length > 0) output.animations = animations;
//   //   }

//   //   output.object = object;

//   //   return output;

//   //   // extract data from the cache hash
//   //   // remove metadata on each item
//   //   // and return as array
//   //   function extractFromCache(cache) {
//   //     const values = [];
//   //     for (const key in cache) {
//   //       const data = cache[key];
//   //       delete data.metadata;
//   //       values.push(data);
//   //     }

//   //     return values;
//   //   }
//   // }

//   clone(recursive: boolean = false) {
//     return new Object3D().copy(this, recursive);
//   }

//   copy(source: Object3D, recursive: boolean = true): Object {
//     this.name = source.name;

//     this.up.copy(source.up);

//     this.position.copy(source.position);
//     this.rotation.order = source.rotation.order;
//     this.quaternion.copy(source.quaternion);
//     this.scale.copy(source.scale);

//     this.matrix.copy(source.matrix);
//     this.matrixWorld.copy(source.matrixWorld);

//     this.matrixAutoUpdate = source.matrixAutoUpdate;
//     this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;

//     this.layers.mask = source.layers.mask;
//     this.visible = source.visible;

//     this.castShadow = source.castShadow;
//     this.receiveShadow = source.receiveShadow;

//     this.frustumCulled = source.frustumCulled;
//     this.renderOrder = source.renderOrder;

//     // TODO:
//     // this.userData = JSON.parse(JSON.stringify(source.userData));

//     if (recursive === true) {
//       for (let i = 0; i < source.children.length; i++) {
//         const child = source.children[i];
//         this.add(child.clone());
//       }
//     }

//     return this;
//   }
// }
