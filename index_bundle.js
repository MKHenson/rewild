(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["main"] = factory();
	else
		root["main"] = factory();
})(self, function() {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./build/release.js":
/*!**************************!*\
  !*** ./build/release.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "instantiate": () => (/* binding */ instantiate)
/* harmony export */ });
async function instantiate(module, imports = {}) {
  const __module0 = imports.Imports;
  const adaptedImports = {
    env: Object.assign(Object.create(globalThis), imports.env || {}, {
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
      "console.log"(text) {
        // ~lib/bindings/dom/console.log(~lib/string/String) => void
        text = __liftString(text >>> 0);
        console.log(text);
      },
      seed() {
        // ~lib/builtins/seed() => f64
        return (() => {
          // @external.js
          return Date.now() * Math.random();
        })();
      },
    }),
    Imports: Object.assign(Object.create(__module0), {
      setupLights(numLights, config, scene, direction) {
        // src/as/Imports/setupLights(u32, usize, usize, usize) => void
        numLights = numLights >>> 0;
        config = config >>> 0;
        scene = scene >>> 0;
        direction = direction >>> 0;
        __module0.setupLights(numLights, config, scene, direction);
      },
      renderComponents(camera, meshComponents) {
        // src/as/Imports/renderComponents(src/as/cameras/Camera/Camera, ~lib/array/Array<src/as/core/Component/Component>) => void
        camera = __liftInternref(camera >>> 0);
        meshComponents = __liftArray(pointer => __liftInternref(new Uint32Array(memory.buffer)[pointer >>> 2]), 2, meshComponents >>> 0);
        __module0.renderComponents(camera, meshComponents);
      },
      onSignalReceived(type, event) {
        // src/as/Imports/onSignalReceived(i32, src/as/core/Event/Event) => void
        event = __liftInternref(event >>> 0);
        __module0.onSignalReceived(type, event);
      },
    }),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    Float32ArrayID: {
      // src/as/index/Float32ArrayID: u32
      valueOf() { return this.value; },
      get value() {
        return exports.Float32ArrayID.value >>> 0;
      }
    },
    foo() {
      // src/as/index/foo() => ~lib/array/Array<i32>
      return __liftArray(pointer => new Int32Array(memory.buffer)[pointer >>> 2], 2, exports.foo() >>> 0);
    },
    getRuntime() {
      // src/as/objects/routing/AsSceneManager/getRuntime() => src/as/objects/routing/core/Runtime/Runtime
      return __liftInternref(exports.getRuntime() >>> 0);
    },
    addContainer(container, activate) {
      // src/as/objects/routing/AsSceneManager/addContainer(src/as/objects/routing/core/Container/Container, bool) => void
      container = __lowerInternref(container) || __notnull();
      activate = activate ? 1 : 0;
      exports.addContainer(container, activate);
    },
    createMeshPipelineInstance(name, index) {
      // src/as/pipelines/MeshPipelineInstance/createMeshPipelineInstance(~lib/string/String, i32) => src/as/pipelines/PipelineInstance/PipelineInstance
      name = __lowerString(name) || __notnull();
      return __liftInternref(exports.createMeshPipelineInstance(name, index) >>> 0);
    },
    setMeshPipelineTransformIndex(pipeline, transformResourceIndex) {
      // src/as/pipelines/MeshPipelineInstance/setMeshPipelineTransformIndex(src/as/pipelines/PipelineInstance/PipelineInstance, i32) => void
      pipeline = __lowerInternref(pipeline) || __notnull();
      exports.setMeshPipelineTransformIndex(pipeline, transformResourceIndex);
    },
    addPipelineAttribute(pipeline, type, location) {
      // src/as/pipelines/PipelineInstance/addPipelineAttribute(src/as/pipelines/PipelineInstance/PipelineInstance, i32, u16) => void
      pipeline = __lowerInternref(pipeline) || __notnull();
      exports.addPipelineAttribute(pipeline, type, location);
    },
    createMeshComponent(geometry, pipeline, name) {
      // src/as/components/MeshComponent/createMeshComponent(src/as/core/BufferGeometry/BufferGeometry, src/as/pipelines/PipelineInstance/PipelineInstance, ~lib/string/String | null?) => src/as/core/Component/Component
      geometry = __retain(__lowerInternref(geometry) || __notnull());
      pipeline = __retain(__lowerInternref(pipeline) || __notnull());
      name = __lowerString(name);
      try {
        exports.__setArgumentsLength(arguments.length);
        return __liftInternref(exports.createMeshComponent(geometry, pipeline, name) >>> 0);
      } finally {
        __release(geometry);
        __release(pipeline);
      }
    },
    createPlayerComponent() {
      // src/as/components/PlayerComponent/createPlayerComponent() => src/as/components/PlayerComponent/PlayerComponent
      return __liftInternref(exports.createPlayerComponent() >>> 0);
    },
    getPlayerComponentProperties(player) {
      // src/as/components/PlayerComponent/getPlayerComponentProperties(src/as/components/PlayerComponent/PlayerComponent) => usize
      player = __lowerInternref(player) || __notnull();
      return exports.getPlayerComponentProperties(player) >>> 0;
    },
    createContainer(name) {
      // src/as/objects/routing/core/Container/createContainer(~lib/string/String) => src/as/objects/routing/core/Container/Container
      name = __lowerString(name) || __notnull();
      return __liftInternref(exports.createContainer(name) >>> 0);
    },
    addAsset(container, object) {
      // src/as/objects/routing/core/Container/addAsset(src/as/objects/routing/core/Container/Container, src/as/core/TransformNode/TransformNode) => void
      container = __retain(__lowerInternref(container) || __notnull());
      object = __lowerInternref(object) || __notnull();
      try {
        exports.addAsset(container, object);
      } finally {
        __release(container);
      }
    },
    createLevel1() {
      // src/as/objects/routing/custom/Level1/createLevel1() => src/as/objects/routing/core/Container/Container
      return __liftInternref(exports.createLevel1() >>> 0);
    },
    createMainMenu() {
      // src/as/objects/routing/custom/MainMenu/createMainMenu() => src/as/objects/routing/core/Container/Container
      return __liftInternref(exports.createMainMenu() >>> 0);
    },
    createTestLevel() {
      // src/as/objects/routing/custom/TestLevel/createTestLevel() => src/as/objects/routing/core/Container/Container
      return __liftInternref(exports.createTestLevel() >>> 0);
    },
    getCameraProjectionInverseMatrix(camera) {
      // src/as/cameras/Camera/getCameraProjectionInverseMatrix(src/as/cameras/Camera/Camera) => usize
      camera = __lowerInternref(camera) || __notnull();
      return exports.getCameraProjectionInverseMatrix(camera) >>> 0;
    },
    getCameraProjectionMatrix(camera) {
      // src/as/cameras/Camera/getCameraProjectionMatrix(src/as/cameras/Camera/Camera) => usize
      camera = __lowerInternref(camera) || __notnull();
      return exports.getCameraProjectionMatrix(camera) >>> 0;
    },
    getCameraWorldInverseMatrix(camera) {
      // src/as/cameras/Camera/getCameraWorldInverseMatrix(src/as/cameras/Camera/Camera) => usize
      camera = __lowerInternref(camera) || __notnull();
      return exports.getCameraWorldInverseMatrix(camera) >>> 0;
    },
    addChild(parent, child) {
      // src/as/core/TransformNode/addChild(src/as/core/TransformNode/TransformNode, src/as/core/TransformNode/TransformNode) => src/as/core/TransformNode/TransformNode
      parent = __retain(__lowerInternref(parent) || __notnull());
      child = __lowerInternref(child) || __notnull();
      try {
        return __liftInternref(exports.addChild(parent, child) >>> 0);
      } finally {
        __release(parent);
      }
    },
    createTransformNode(name) {
      // src/as/core/TransformNode/createTransformNode(~lib/string/String | null) => src/as/core/TransformNode/TransformNode
      name = __lowerString(name);
      return __liftInternref(exports.createTransformNode(name) >>> 0);
    },
    removeChild(parent, child) {
      // src/as/core/TransformNode/removeChild(src/as/core/TransformNode/TransformNode, src/as/core/TransformNode/TransformNode) => src/as/core/TransformNode/TransformNode
      parent = __retain(__lowerInternref(parent) || __notnull());
      child = __lowerInternref(child) || __notnull();
      try {
        return __liftInternref(exports.removeChild(parent, child) >>> 0);
      } finally {
        __release(parent);
      }
    },
    getVisibility(node) {
      // src/as/core/TransformNode/getVisibility(src/as/core/TransformNode/TransformNode) => bool
      node = __lowerInternref(node) || __notnull();
      return exports.getVisibility(node) != 0;
    },
    setVisibility(node, value) {
      // src/as/core/TransformNode/setVisibility(src/as/core/TransformNode/TransformNode, bool) => void
      node = __lowerInternref(node) || __notnull();
      value = value ? 1 : 0;
      exports.setVisibility(node, value);
    },
    addComponent(node, component) {
      // src/as/core/TransformNode/addComponent(src/as/core/TransformNode/TransformNode, src/as/core/Component/Component) => src/as/core/TransformNode/TransformNode
      node = __retain(__lowerInternref(node) || __notnull());
      component = __lowerInternref(component) || __notnull();
      try {
        return __liftInternref(exports.addComponent(node, component) >>> 0);
      } finally {
        __release(node);
      }
    },
    getDataProperties(node) {
      // src/as/core/TransformNode/getDataProperties(src/as/core/TransformNode/TransformNode) => usize
      node = __lowerInternref(node) || __notnull();
      return exports.getDataProperties(node) >>> 0;
    },
    getId(node) {
      // src/as/core/TransformNode/getId(src/as/core/TransformNode/TransformNode) => i32
      node = __lowerInternref(node) || __notnull();
      return exports.getId(node);
    },
    setId(node, value) {
      // src/as/core/TransformNode/setId(src/as/core/TransformNode/TransformNode, i32) => src/as/core/TransformNode/TransformNode
      node = __lowerInternref(node) || __notnull();
      return __liftInternref(exports.setId(node, value) >>> 0);
    },
    getTransformModelViewMatrix(node) {
      // src/as/core/TransformNode/getTransformModelViewMatrix(src/as/core/TransformNode/TransformNode) => usize
      node = __lowerInternref(node) || __notnull();
      return exports.getTransformModelViewMatrix(node) >>> 0;
    },
    getTransformNormalMatrix(node) {
      // src/as/core/TransformNode/getTransformNormalMatrix(src/as/core/TransformNode/TransformNode) => usize
      node = __lowerInternref(node) || __notnull();
      return exports.getTransformNormalMatrix(node) >>> 0;
    },
    getTransformWorldMatrix(node) {
      // src/as/core/TransformNode/getTransformWorldMatrix(src/as/core/TransformNode/TransformNode) => usize
      node = __lowerInternref(node) || __notnull();
      return exports.getTransformWorldMatrix(node) >>> 0;
    },
    creatBufferGeometry() {
      // src/as/core/BufferGeometry/creatBufferGeometry() => src/as/core/BufferGeometry/BufferGeometry
      return __liftInternref(exports.creatBufferGeometry() >>> 0);
    },
    createBufferAttributeF32(array, itemSize, normalized) {
      // src/as/core/BufferGeometry/createBufferAttributeF32(~lib/typedarray/Float32Array, u32, bool) => src/as/core/BufferAttribute/BaseAttribute
      array = __lowerTypedArray(Float32Array, 16, 2, array) || __notnull();
      normalized = normalized ? 1 : 0;
      return __liftInternref(exports.createBufferAttributeF32(array, itemSize, normalized) >>> 0);
    },
    setBufferAttribute(geometry, type, attributeBuffer) {
      // src/as/core/BufferGeometry/setBufferAttribute(src/as/core/BufferGeometry/BufferGeometry, i32, src/as/core/BufferAttribute/BaseAttribute) => void
      geometry = __retain(__lowerInternref(geometry) || __notnull());
      attributeBuffer = __lowerInternref(attributeBuffer) || __notnull();
      try {
        exports.setBufferAttribute(geometry, type, attributeBuffer);
      } finally {
        __release(geometry);
      }
    },
    createBufferAttributeu32(array, itemSize, normalized) {
      // src/as/core/BufferGeometry/createBufferAttributeu32(~lib/typedarray/Uint32Array, u32, bool) => src/as/core/BufferAttribute/BaseAttribute
      array = __lowerTypedArray(Uint32Array, 54, 2, array) || __notnull();
      normalized = normalized ? 1 : 0;
      return __liftInternref(exports.createBufferAttributeu32(array, itemSize, normalized) >>> 0);
    },
    setIndexAttribute(geometry, attributeBuffer) {
      // src/as/core/BufferGeometry/setIndexAttribute(src/as/core/BufferGeometry/BufferGeometry, src/as/core/BufferAttribute/BaseAttribute) => void
      geometry = __retain(__lowerInternref(geometry) || __notnull());
      attributeBuffer = __lowerInternref(attributeBuffer) || __notnull();
      try {
        exports.setIndexAttribute(geometry, attributeBuffer);
      } finally {
        __release(geometry);
      }
    },
    dispatchOnKeyDown(keyEvent) {
      // src/as/extras/io/InputManager/dispatchOnKeyDown(src/as/extras/io/KeyboardEvent/KeyboardEvent) => void
      keyEvent = __lowerInternref(keyEvent) || __notnull();
      exports.dispatchOnKeyDown(keyEvent);
    },
    dispatchOnKeyUp(keyEvent) {
      // src/as/extras/io/InputManager/dispatchOnKeyUp(src/as/extras/io/KeyboardEvent/KeyboardEvent) => void
      keyEvent = __lowerInternref(keyEvent) || __notnull();
      exports.dispatchOnKeyUp(keyEvent);
    },
    dispatchOnMouseDown(mouseEvent) {
      // src/as/extras/io/InputManager/dispatchOnMouseDown(src/as/extras/io/MouseEvent/MouseEvent) => void
      mouseEvent = __lowerInternref(mouseEvent) || __notnull();
      exports.dispatchOnMouseDown(mouseEvent);
    },
    dispatchOnMouseMove(mouseEvent) {
      // src/as/extras/io/InputManager/dispatchOnMouseMove(src/as/extras/io/MouseEvent/MouseEvent) => void
      mouseEvent = __lowerInternref(mouseEvent) || __notnull();
      exports.dispatchOnMouseMove(mouseEvent);
    },
    dispatchOnMouseUp(mouseEvent) {
      // src/as/extras/io/InputManager/dispatchOnMouseUp(src/as/extras/io/MouseEvent/MouseEvent) => void
      mouseEvent = __lowerInternref(mouseEvent) || __notnull();
      exports.dispatchOnMouseUp(mouseEvent);
    },
    dispatchOnWheel(mouseEvent) {
      // src/as/extras/io/InputManager/dispatchOnWheel(src/as/extras/io/MouseEvent/MouseEvent) => void
      mouseEvent = __lowerInternref(mouseEvent) || __notnull();
      exports.dispatchOnWheel(mouseEvent);
    },
    createMouseEvent(clientX, clientY, pageX, pageY, ctrlKey, shiftKey, altKey, button, buttons, targetX, targetY, targetWidth, targetHeight, delta, movementX, movementY) {
      // src/as/extras/io/MouseEvent/createMouseEvent(i32, i32, i32, i32, bool, bool, bool, i32, i32, i32, i32, i32, i32, i16, i16, i16) => src/as/extras/io/MouseEvent/MouseEvent
      ctrlKey = ctrlKey ? 1 : 0;
      shiftKey = shiftKey ? 1 : 0;
      altKey = altKey ? 1 : 0;
      return __liftInternref(exports.createMouseEvent(clientX, clientY, pageX, pageY, ctrlKey, shiftKey, altKey, button, buttons, targetX, targetY, targetWidth, targetHeight, delta, movementX, movementY) >>> 0);
    },
    createKeyboardEvent(code) {
      // src/as/extras/io/KeyboardEvent/createKeyboardEvent(~lib/string/String) => src/as/extras/io/KeyboardEvent/KeyboardEvent
      code = __lowerString(code) || __notnull();
      return __liftInternref(exports.createKeyboardEvent(code) >>> 0);
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __lowerString(value) {
    if (value == null) return 0;
    const
      length = value.length,
      pointer = exports.__new(length << 1, 1) >>> 0,
      memoryU16 = new Uint16Array(memory.buffer);
    for (let i = 0; i < length; ++i) memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i);
    return pointer;
  }
  function __liftArray(liftElement, align, pointer) {
    if (!pointer) return null;
    const
      memoryU32 = new Uint32Array(memory.buffer),
      dataStart = memoryU32[pointer + 4 >>> 2],
      length = memoryU32[pointer + 12 >>> 2],
      values = new Array(length);
    for (let i = 0; i < length; ++i) values[i] = liftElement(dataStart + (i << align >>> 0));
    return values;
  }
  function __lowerTypedArray(constructor, id, align, values) {
    if (values == null) return 0;
    const
      length = values.length,
      buffer = exports.__pin(exports.__new(length << align, 0)) >>> 0,
      header = exports.__new(12, id) >>> 0,
      memoryU32 = new Uint32Array(memory.buffer);
    memoryU32[header + 0 >>> 2] = buffer;
    memoryU32[header + 4 >>> 2] = buffer;
    memoryU32[header + 8 >>> 2] = length << align;
    new constructor(memory.buffer, buffer, length).set(values);
    exports.__unpin(buffer);
    return header;
  }
  const registry = new FinalizationRegistry(__release);
  class Internref extends Number {}
  function __liftInternref(pointer) {
    if (!pointer) return null;
    const sentinel = new Internref(__retain(pointer));
    registry.register(sentinel, pointer);
    return sentinel;
  }
  function __lowerInternref(value) {
    if (value == null) return 0;
    if (value instanceof Internref) return value.valueOf();
    throw TypeError("internref expected");
  }
  const refcounts = new Map();
  function __retain(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount) refcounts.set(pointer, refcount + 1);
      else refcounts.set(exports.__pin(pointer), 1);
    }
    return pointer;
  }
  function __release(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount === 1) exports.__unpin(pointer), refcounts.delete(pointer);
      else if (refcount) refcounts.set(pointer, refcount - 1);
      else throw Error(`invalid refcount '${refcount}' for reference '${pointer}'`);
    }
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  return adaptedExports;
}


/***/ }),

/***/ "./src/common/AttributeType.ts":
/*!*************************************!*\
  !*** ./src/common/AttributeType.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "AttributeType": () => (/* binding */ AttributeType)
/* harmony export */ });
let AttributeType;

(function (AttributeType) {
  AttributeType[AttributeType["POSITION"] = 0] = "POSITION";
  AttributeType[AttributeType["NORMAL"] = 1] = "NORMAL";
  AttributeType[AttributeType["UV"] = 2] = "UV";
  AttributeType[AttributeType["TANGENT"] = 3] = "TANGENT";
})(AttributeType || (AttributeType = {}));

/***/ }),

/***/ "./src/common/GroupType.ts":
/*!*********************************!*\
  !*** ./src/common/GroupType.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "GroupType": () => (/* binding */ GroupType)
/* harmony export */ });
let GroupType;

(function (GroupType) {
  GroupType[GroupType["Transform"] = 0] = "Transform";
  GroupType[GroupType["Material"] = 1] = "Material";
})(GroupType || (GroupType = {}));

/***/ }),

/***/ "./src/common/ResourceType.ts":
/*!************************************!*\
  !*** ./src/common/ResourceType.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ResourceType": () => (/* binding */ ResourceType)
/* harmony export */ });
let ResourceType;

(function (ResourceType) {
  ResourceType[ResourceType["Transform"] = 0] = "Transform";
  ResourceType[ResourceType["Material"] = 1] = "Material";
  ResourceType[ResourceType["Lighting"] = 2] = "Lighting";
  ResourceType[ResourceType["Texture"] = 3] = "Texture";
})(ResourceType || (ResourceType = {}));

/***/ }),

/***/ "./src/common/UIEventType.ts":
/*!***********************************!*\
  !*** ./src/common/UIEventType.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "UIEventType": () => (/* binding */ UIEventType)
/* harmony export */ });
let UIEventType;

(function (UIEventType) {
  UIEventType[UIEventType["StartGame"] = 0] = "StartGame";
  UIEventType[UIEventType["QuitGame"] = 1] = "QuitGame";
  UIEventType[UIEventType["OpenInGameMenu"] = 2] = "OpenInGameMenu";
  UIEventType[UIEventType["PlayerDied"] = 3] = "PlayerDied";
  UIEventType[UIEventType["Resume"] = 4] = "Resume";
})(UIEventType || (UIEventType = {}));

/***/ }),

/***/ "./src/common/math/EulerOrder.ts":
/*!***************************************!*\
  !*** ./src/common/math/EulerOrder.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "EulerRotationOrder": () => (/* binding */ EulerRotationOrder)
/* harmony export */ });
let EulerRotationOrder;

(function (EulerRotationOrder) {
  EulerRotationOrder[EulerRotationOrder["XYZ"] = 0] = "XYZ";
  EulerRotationOrder[EulerRotationOrder["YZX"] = 1] = "YZX";
  EulerRotationOrder[EulerRotationOrder["ZXY"] = 2] = "ZXY";
  EulerRotationOrder[EulerRotationOrder["XZY"] = 3] = "XZY";
  EulerRotationOrder[EulerRotationOrder["YXZ"] = 4] = "YXZ";
  EulerRotationOrder[EulerRotationOrder["ZYX"] = 5] = "ZYX";
})(EulerRotationOrder || (EulerRotationOrder = {}));

/***/ }),

/***/ "./src/common/math/MathUtils.ts":
/*!**************************************!*\
  !*** ./src/common/math/MathUtils.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "DEG2RAD": () => (/* binding */ DEG2RAD),
/* harmony export */   "RAD2DEG": () => (/* binding */ RAD2DEG),
/* harmony export */   "ceilPowerOfTwo": () => (/* binding */ ceilPowerOfTwo),
/* harmony export */   "clamp": () => (/* binding */ clamp),
/* harmony export */   "damp": () => (/* binding */ damp),
/* harmony export */   "degToRad": () => (/* binding */ degToRad),
/* harmony export */   "euclideanModulo": () => (/* binding */ euclideanModulo),
/* harmony export */   "floorPowerOfTwo": () => (/* binding */ floorPowerOfTwo),
/* harmony export */   "generateUUID": () => (/* binding */ generateUUID),
/* harmony export */   "inverseLerp": () => (/* binding */ inverseLerp),
/* harmony export */   "isPowerOfTwo": () => (/* binding */ isPowerOfTwo),
/* harmony export */   "lerp": () => (/* binding */ lerp),
/* harmony export */   "mapLinear": () => (/* binding */ mapLinear),
/* harmony export */   "pingpong": () => (/* binding */ pingpong),
/* harmony export */   "radToDeg": () => (/* binding */ radToDeg),
/* harmony export */   "randFloat": () => (/* binding */ randFloat),
/* harmony export */   "randFloatSpread": () => (/* binding */ randFloatSpread),
/* harmony export */   "randInt": () => (/* binding */ randInt),
/* harmony export */   "seededRandom": () => (/* binding */ seededRandom),
/* harmony export */   "setQuaternionFromProperEuler": () => (/* binding */ setQuaternionFromProperEuler),
/* harmony export */   "smootherstep": () => (/* binding */ smootherstep),
/* harmony export */   "smoothstep": () => (/* binding */ smoothstep)
/* harmony export */ });
const _lut = [];

for (let i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? "0" : "") + i.toString(16);
}

let _seed = 1234567;
const DEG2RAD = Mathf.PI / 180;
const RAD2DEG = 180 / Mathf.PI; // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136

function generateUUID() {
  const d0 = u32(Mathf.random() * 0xffffffff) | 0;
  const d1 = u32(Mathf.random() * 0xffffffff) | 0;
  const d2 = u32(Mathf.random() * 0xffffffff) | 0;
  const d3 = u32(Mathf.random() * 0xffffffff) | 0;
  const uuid = _lut[d0 & 0xff] + _lut[d0 >> 8 & 0xff] + _lut[d0 >> 16 & 0xff] + _lut[d0 >> 24 & 0xff] + "-" + _lut[d1 & 0xff] + _lut[d1 >> 8 & 0xff] + "-" + _lut[d1 >> 16 & 0x0f | 0x40] + _lut[d1 >> 24 & 0xff] + "-" + _lut[d2 & 0x3f | 0x80] + _lut[d2 >> 8 & 0xff] + "-" + _lut[d2 >> 16 & 0xff] + _lut[d2 >> 24 & 0xff] + _lut[d3 & 0xff] + _lut[d3 >> 8 & 0xff] + _lut[d3 >> 16 & 0xff] + _lut[d3 >> 24 & 0xff]; // .toUpperCase() here flattens concatenated strings to save heap memory space.

  return uuid.toUpperCase();
}
function clamp(value, min, max) {
  return Mathf.max(min, Mathf.min(max, value));
} // compute euclidian modulo of m % n
// https://en.wikipedia.org/wiki/Modulo_operation

function euclideanModulo(n, m) {
  return (n % m + m) % m;
} // Linear mapping from range <a1, a2> to range <b1, b2>

function mapLinear(x, a1, a2, b1, b2) {
  return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
} // https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/

function inverseLerp(x, y, value) {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
} // https://en.wikipedia.org/wiki/Linear_interpolation

function lerp(x, y, t) {
  return (1 - t) * x + t * y;
} // http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/

function damp(x, y, lambda, dt) {
  return lerp(x, y, 1 - Mathf.exp(-lambda * dt));
} // https://www.desmos.com/calculator/vcsjnyz7x4

function pingpong(x) {
  let length = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
  return length - Mathf.abs(euclideanModulo(x, length * 2) - length);
} // http://en.wikipedia.org/wiki/Smoothstep

function smoothstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * (3 - 2 * x);
}
function smootherstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * x * (x * (x * 6 - 15) + 10);
} // Random integer from <low, high> interval

function randInt(low, high) {
  return low + Mathf.floor(Mathf.random() * (high - low + 1));
} // Random float from <low, high> interval

function randFloat(low, high) {
  return low + Mathf.random() * (high - low);
} // Random float from <-range/2, range/2> interval

function randFloatSpread(range) {
  return range * (0.5 - Mathf.random());
} // Deterministic pseudo-random float in the interval [ 0, 1 ]

function seededRandom(s) {
  if (s !== undefined) _seed = s % 2147483647; // Park-Miller algorithm

  _seed = _seed * 16807 % 2147483647;
  return (_seed - 1) / 2147483646;
}
function degToRad(degrees) {
  return degrees * DEG2RAD;
}
function radToDeg(radians) {
  return radians * RAD2DEG;
}
function isPowerOfTwo(value) {
  return (value & value - 1) === 0 && value !== 0;
}
function ceilPowerOfTwo(value) {
  return Mathf.pow(2, Mathf.ceil(Mathf.log(value) / Mathf.LN2));
}
function floorPowerOfTwo(value) {
  return Mathf.pow(2, Mathf.floor(Mathf.log(value) / Mathf.LN2));
}
function setQuaternionFromProperEuler(q, a, b, c, order) {
  // Intrinsic Proper Euler Angles - see https://en.wikipedia.org/wiki/Euler_angles
  // rotations are applied to the axes in the order specified by 'order'
  // rotation by angle 'a' is applied first, then by angle 'b', then by angle 'c'
  // angles are in radians
  const cos = Mathf.cos;
  const sin = Mathf.sin;
  const c2 = cos(b / 2);
  const s2 = sin(b / 2);
  const c13 = cos((a + c) / 2);
  const s13 = sin((a + c) / 2);
  const c1_3 = cos((a - c) / 2);
  const s1_3 = sin((a - c) / 2);
  const c3_1 = cos((c - a) / 2);
  const s3_1 = sin((c - a) / 2);

  switch (order) {
    case "XYX":
      q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
      break;

    case "YZY":
      q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
      break;

    case "ZXZ":
      q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
      break;

    case "XZX":
      q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
      break;

    case "YXY":
      q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
      break;

    case "ZYZ":
      q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
      break;

    default:
      console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: " + order);
  }
}

/***/ }),

/***/ "./src/common/math/Quaternion.ts":
/*!***************************************!*\
  !*** ./src/common/math/Quaternion.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Quaternion": () => (/* binding */ Quaternion)
/* harmony export */ });
/* harmony import */ var _MathUtils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MathUtils */ "./src/common/math/MathUtils.ts");
/* harmony import */ var _EulerOrder__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./EulerOrder */ "./src/common/math/EulerOrder.ts");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }



class Quaternion {
  constructor() {
    let x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    let y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    let z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    let w = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

    _defineProperty(this, "isQuaternion", true);

    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback = null;
  }

  static slerp(qa, qb, qm, t) {
    return qm.slerpQuaternions(qa, qb, t);
  }

  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
    // fuzz-free, array-based Quaternion SLERP operation
    let x0 = src0[srcOffset0 + 0],
        y0 = src0[srcOffset0 + 1],
        z0 = src0[srcOffset0 + 2],
        w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1 + 0],
          y1 = src1[srcOffset1 + 1],
          z1 = src1[srcOffset1 + 2],
          w1 = src1[srcOffset1 + 3];

    if (t === 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }

    if (t === 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }

    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let s = 1 - t;
      const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1,
            dir = cos >= 0 ? 1 : -1,
            sqrSin = 1 - cos * cos; // Skip the Slerp for tiny steps to avoid numeric problems:

      if (sqrSin > f32.EPSILON) {
        const sin = Mathf.sqrt(sqrSin),
              len = Mathf.atan2(sin, cos * dir);
        s = Mathf.sin(s * len) / sin;
        t = Mathf.sin(t * len) / sin;
      }

      const tDir = t * dir;
      x0 = x0 * s + x1 * tDir;
      y0 = y0 * s + y1 * tDir;
      z0 = z0 * s + z1 * tDir;
      w0 = w0 * s + w1 * tDir; // Normalize in case we just did a lerp:

      if (s === 1 - t) {
        const f = 1 / Mathf.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f;
        y0 *= f;
        z0 *= f;
        w0 *= f;
      }
    }

    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }

  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }

  get x() {
    return this._x;
  }

  set x(value) {
    this._x = value;
    this.onChangeCallback();
  }

  get y() {
    return this._y;
  }

  set y(value) {
    this._y = value;
    this.onChangeCallback();
  }

  get z() {
    return this._z;
  }

  set z(value) {
    this._z = value;
    this.onChangeCallback();
  }

  get w() {
    return this._w;
  }

  set w(value) {
    this._w = value;
    this.onChangeCallback();
  }

  set(x, y, z, w) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this.onChangeCallback();
    return this;
  }

  clone() {
    return new Quaternion(this._x, this._y, this._z, this._w);
  }

  copy(quaternion) {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this.onChangeCallback();
    return this;
  }

  setFromEuler(euler, update) {
    const x = euler._x,
          y = euler._y,
          z = euler._z,
          order = euler._order; // http://www.mathworks.com/matlabcentral/fileexchange/
    // 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
    //	content/SpinCalc.m

    const cos = Mathf.cos;
    const sin = Mathf.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);

    switch (order) {
      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.XYZ:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.YXZ:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.ZXY:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.ZYX:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.YZX:
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;

      case _EulerOrder__WEBPACK_IMPORTED_MODULE_1__.EulerRotationOrder.XZY:
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;

      default:
        throw new Error("Quaternion: .setFromEuler() encountered an unknown order");
    }

    if (update !== false) this.onChangeCallback();
    return this;
  }

  setFromAxisAngle(axis, angle) {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm
    // assumes axis is normalized
    const halfAngle = angle / 2,
          s = Mathf.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Mathf.cos(halfAngle);
    this.onChangeCallback();
    return this;
  }

  setFromRotationMatrix(m) {
    // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
    const te = m.elements,
          m11 = te[0],
          m12 = te[4],
          m13 = te[8],
          m21 = te[1],
          m22 = te[5],
          m23 = te[9],
          m31 = te[2],
          m32 = te[6],
          m33 = te[10],
          trace = m11 + m22 + m33;

    if (trace > 0) {
      const s = 0.5 / Mathf.sqrt(trace + 1.0);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2.0 * Mathf.sqrt(1.0 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2.0 * Mathf.sqrt(1.0 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      const s = 2.0 * Mathf.sqrt(1.0 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }

    this.onChangeCallback();
    return this;
  }

  setFromUnitVectors(vFrom, vTo) {
    // assumes direction vectors vFrom and vTo are normalized
    let r = vFrom.dot(vTo) + 1;

    if (r < f32.EPSILON) {
      // vFrom and vTo point in opposite directions
      r = 0;

      if (Mathf.abs(vFrom.x) > Mathf.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r;
      }
    } else {
      // crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector3
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r;
    }

    return this.normalize();
  }

  angleTo(q) {
    return 2 * Mathf.acos(Mathf.abs(_MathUtils__WEBPACK_IMPORTED_MODULE_0__.clamp(this.dot(q), -1, 1)));
  }

  rotateTowards(q, step) {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t = Mathf.min(1, step / angle);
    this.slerp(q, t);
    return this;
  }

  identity() {
    return this.set(0, 0, 0, 1);
  }

  invert() {
    // quaternion is assumed to have unit length
    return this.conjugate();
  }

  conjugate() {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this.onChangeCallback();
    return this;
  }

  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }

  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }

  length() {
    return Mathf.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }

  normalize() {
    let l = this.length();

    if (l === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l = 1 / l;
      this._x = this._x * l;
      this._y = this._y * l;
      this._z = this._z * l;
      this._w = this._w * l;
    }

    this.onChangeCallback();
    return this;
  }

  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }

  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }

  multiplyQuaternions(a, b) {
    // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm
    const qax = a._x,
          qay = a._y,
          qaz = a._z,
          qaw = a._w;
    const qbx = b._x,
          qby = b._y,
          qbz = b._z,
          qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this.onChangeCallback();
    return this;
  }

  slerp(qb, t) {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this._x,
          y = this._y,
          z = this._z,
          w = this._w; // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;

    if (cosHalfTheta < 0) {
      this._w = -qb._w;
      this._x = -qb._x;
      this._y = -qb._y;
      this._z = -qb._z;
      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }

    if (cosHalfTheta >= 1.0) {
      this._w = w;
      this._x = x;
      this._y = y;
      this._z = z;
      return this;
    }

    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;

    if (sqrSinHalfTheta <= f32.EPSILON) {
      const s = 1 - t;
      this._w = s * w + t * this._w;
      this._x = s * x + t * this._x;
      this._y = s * y + t * this._y;
      this._z = s * z + t * this._z;
      this.normalize();
      this.onChangeCallback();
      return this;
    }

    const sinHalfTheta = Mathf.sqrt(sqrSinHalfTheta);
    const halfTheta = Mathf.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Mathf.sin((1 - t) * halfTheta) / sinHalfTheta,
          ratioB = Mathf.sin(t * halfTheta) / sinHalfTheta;
    this._w = w * ratioA + this._w * ratioB;
    this._x = x * ratioA + this._x * ratioB;
    this._y = y * ratioA + this._y * ratioB;
    this._z = z * ratioA + this._z * ratioB;
    this.onChangeCallback();
    return this;
  }

  slerpQuaternions(qa, qb, t) {
    this.copy(qa).slerp(qb, t);
  }

  equals(quaternion) {
    return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
  }

  fromArray(array) {
    let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this.onChangeCallback();
    return this;
  }

  toArray() {
    let array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  } // TODO:
  //   fromBufferAttribute(attribute, index) {
  //     this._x = attribute.getX(index);
  //     this._y = attribute.getY(index);
  //     this._z = attribute.getZ(index);
  //     this._w = attribute.getW(index);
  //     return this;
  //   }


  onChangeCallback() {
    if (this._onChangeCallback) this._onChangeCallback.onQuatChanged(this);
  }

  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }

}

/***/ }),

/***/ "./src/common/math/Vector3.ts":
/*!************************************!*\
  !*** ./src/common/math/Vector3.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Vector3": () => (/* binding */ Vector3)
/* harmony export */ });
/* harmony import */ var _MathUtils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MathUtils */ "./src/common/math/MathUtils.ts");
/* harmony import */ var _Quaternion__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Quaternion */ "./src/common/math/Quaternion.ts");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }



class Vector3 {
  constructor() {
    let x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    let y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    let z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

    _defineProperty(this, "isVector3", true);

    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setByIndex(index, value) {
    if (index === 0) this.x = value;else if (index === 1) this.y = value;else this.z = value;
    return this;
  }

  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }

  setX(x) {
    this.x = x;
    return this;
  }

  setY(y) {
    this.y = y;
    return this;
  }

  setZ(z) {
    this.z = z;
    return this;
  }

  setComponent(index, value) {
    switch (index) {
      case 0:
        this.x = value;
        break;

      case 1:
        this.y = value;
        break;

      case 2:
        this.z = value;
        break;

      default:
        throw new Error(`index is out of range: ${index}`);
    }

    return this;
  }

  getComponent(index) {
    switch (index) {
      case 0:
        return this.x;

      case 1:
        return this.y;

      case 2:
        return this.z;

      default:
        throw new Error(`index is out of range: ${index}`);
    }
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addScalar(s) {
    this.x += s;
    this.y += s;
    this.z += s;
    return this;
  }

  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subScalar(s) {
    this.x -= s;
    this.y -= s;
    this.z -= s;
    return this;
  }

  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  multiplyVectors(a, b) {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  }

  applyEuler(euler) {
    return this.applyQuaternion(_quaternion.setFromEuler(euler, false));
  }

  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
  }

  applyMatrix3(m) {
    const x = this.x,
          y = this.y,
          z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }

  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize();
  }

  applyMatrix4(m) {
    const x = this.x,
          y = this.y,
          z = this.z;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }

  applyQuaternion(q) {
    const x = this.x,
          y = this.y,
          z = this.z;
    const qx = q.x,
          qy = q.y,
          qz = q.z,
          qw = q.w; // calculate quat * vector

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z; // calculate result * inverse quat

    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }

  transformDirection(m) {
    // input: THREE.Matrix4 affine matrix
    // vector interpreted as a direction
    const x = this.x,
          y = this.y,
          z = this.z;
    const e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }

  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }

  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }

  min(v) {
    this.x = Mathf.min(this.x, v.x);
    this.y = Mathf.min(this.y, v.y);
    this.z = Mathf.min(this.z, v.z);
    return this;
  }

  max(v) {
    this.x = Mathf.max(this.x, v.x);
    this.y = Mathf.max(this.y, v.y);
    this.z = Mathf.max(this.z, v.z);
    return this;
  }

  clamp(min, max) {
    // assumes min < max, componentwise
    this.x = Mathf.max(min.x, Mathf.min(max.x, this.x));
    this.y = Mathf.max(min.y, Mathf.min(max.y, this.y));
    this.z = Mathf.max(min.z, Mathf.min(max.z, this.z));
    return this;
  }

  clampScalar(minVal, maxVal) {
    this.x = Mathf.max(minVal, Mathf.min(maxVal, this.x));
    this.y = Mathf.max(minVal, Mathf.min(maxVal, this.y));
    this.z = Mathf.max(minVal, Mathf.min(maxVal, this.z));
    return this;
  }

  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Mathf.max(min, Mathf.min(max, length)));
  }

  floor() {
    this.x = Mathf.floor(this.x);
    this.y = Mathf.floor(this.y);
    this.z = Mathf.floor(this.z);
    return this;
  }

  ceil() {
    this.x = Mathf.ceil(this.x);
    this.y = Mathf.ceil(this.y);
    this.z = Mathf.ceil(this.z);
    return this;
  }

  round() {
    this.x = Mathf.round(this.x);
    this.y = Mathf.round(this.y);
    this.z = Mathf.round(this.z);
    return this;
  }

  roundToZero() {
    this.x = this.x < 0 ? Mathf.ceil(this.x) : Mathf.floor(this.x);
    this.y = this.y < 0 ? Mathf.ceil(this.y) : Mathf.floor(this.y);
    this.z = this.z < 0 ? Mathf.ceil(this.z) : Mathf.floor(this.z);
    return this;
  }

  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  } // TODO lengthSquared?


  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length() {
    return Mathf.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  manhattanLength() {
    return Mathf.abs(this.x) + Mathf.abs(this.y) + Mathf.abs(this.z);
  }

  normalize() {
    return this.divideScalar(this.length() || 1);
  }

  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }

  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }

  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }

  cross(v) {
    return this.crossVectors(this, v);
  }

  crossVectors(a, b) {
    const ax = a.x,
          ay = a.y,
          az = a.z;
    const bx = b.x,
          by = b.y,
          bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  projectOnVector(v) {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }

  projectOnPlane(planeNormal) {
    _vector.copy(this).projectOnVector(planeNormal);

    return this.sub(_vector);
  }

  reflect(normal) {
    // reflect incident vector off plane orthogonal to normal
    // normal is assumed to have unit length
    return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  angleTo(v) {
    const denominator = Mathf.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Mathf.PI / 2;
    const theta = this.dot(v) / denominator; // clamp, to handle numerical problems

    return Mathf.acos(_MathUtils__WEBPACK_IMPORTED_MODULE_0__.clamp(theta, -1, 1));
  }

  distanceTo(v) {
    return Mathf.sqrt(this.distanceToSquared(v));
  }

  distanceToSquared(v) {
    const dx = this.x - v.x,
          dy = this.y - v.y,
          dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  manhattanDistanceTo(v) {
    return Mathf.abs(this.x - v.x) + Mathf.abs(this.y - v.y) + Mathf.abs(this.z - v.z);
  }

  setFromSpherical(s) {
    return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
  }

  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Mathf.sin(phi) * radius;
    this.x = sinPhiRadius * Mathf.sin(theta);
    this.y = Mathf.cos(phi) * radius;
    this.z = sinPhiRadius * Mathf.cos(theta);
    return this;
  }

  setFromCylindrical(c) {
    return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
  }

  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Mathf.sin(theta);
    this.y = y;
    this.z = radius * Mathf.cos(theta);
    return this;
  }

  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }

  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }

  setFromMatrixColumn(m, index) {
    return this.fromF32Array(m.elements, index * 4);
  }

  setFromMatrix3Column(m, index) {
    return this.fromF32Array(m.elements, index * 3);
  }

  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }

  fromArray(array) {
    let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }

  fromF32Array(array) {
    let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }

  toArray() {
    let array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
    let offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }

  random() {
    this.x = Mathf.random();
    this.y = Mathf.random();
    this.z = Mathf.random();
    return this;
  }

}

const _vector = new Vector3();

const _quaternion = new _Quaternion__WEBPACK_IMPORTED_MODULE_1__.Quaternion();

/***/ }),

/***/ "./src/ts/core/Clock.ts":
/*!******************************!*\
  !*** ./src/ts/core/Clock.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Clock": () => (/* binding */ Clock)
/* harmony export */ });
class Clock {
  constructor() {
    let autoStart = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
    this.autoStart = autoStart;
    this.startTime = 0;
    this.oldTime = 0;
    this.elapsedTime = 0;
    this.running = false;
  }

  start() {
    this.startTime = now();
    this.oldTime = this.startTime;
    this.elapsedTime = 0;
    this.running = true;
  }

  stop() {
    this.getElapsedTime();
    this.running = false;
    this.autoStart = false;
  }

  getElapsedTime() {
    this.getDelta();
    return this.elapsedTime;
  }

  getDelta() {
    let diff = 0;

    if (this.autoStart && !this.running) {
      this.start();
      return 0;
    }

    if (this.running) {
      const newTime = now();
      diff = (newTime - this.oldTime) / 1000;
      this.oldTime = newTime;
      this.elapsedTime += diff;
    }

    return diff;
  }

}

function now() {
  return performance.now();
}

/***/ }),

/***/ "./src/ts/core/EventDispatcher.ts":
/*!****************************************!*\
  !*** ./src/ts/core/EventDispatcher.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "DispatchableEvent": () => (/* binding */ DispatchableEvent),
/* harmony export */   "default": () => (/* binding */ EventDispatcher)
/* harmony export */ });
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * Vehicle for dispatching DispatchableEvent objects.
 *
 * @author Jeremy Daley
 * @version 0.0.1
 * @export
 * @class EventDispatcher
 * @implements {EventTarget}
 */
class EventDispatcher {
  constructor() {
    _defineProperty(this, "listeners", {});

    _defineProperty(this, "target", null);
  }
  /**
   * Add a listener for an event type.
   *
   * @param {string} type Type of event.
   * @param {*} callback Callback for dispatched event.
   * @memberof EventDispatcher
   */


  addEventListener(type, callback) {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(callback);
  }
  /**
   * Removes a listener that's been added.
   *
   * @param {string} type Type of event.
   * @param {any} callback Callback for dispatched event.
   * @returns
   * @memberof EventDispatcher
   */


  removeEventListener(type, callback) {
    if (!(type in this.listeners)) {
      return;
    }

    var stack = this.listeners[type];

    for (let i = 0, l = stack.length; i < l; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);
        return;
      }
    }
  }
  /**
   * Dispatches an event to any listeners.
   *
   * @param {DispatchableEvent} event An event object to dispatch.
   * @returns
   * @memberof EventDispatcher
   */


  dispatchEvent(event) {
    if (!(event.type in this.listeners)) {
      return true;
    }

    let stack = this.listeners[event.type];

    for (let i = 0, l = stack.length; i < l; i++) {
      stack[i].call(this, event);
    }

    return false;
  }

}
/**
 * Generic event for dispatching through an EventDispatcher.
 *
 * @export
 * @class DispatchableEvent
 */

class DispatchableEvent {
  /**
   * Instantiates a new DispatchableEvent object
   *
   * @param {string} type Type of event.
   * @memberof DispatchableEvent
   */
  constructor(type) {
    this.type = type;
  }

}

/***/ }),

/***/ "./src/ts/core/GameManager.ts":
/*!************************************!*\
  !*** ./src/ts/core/GameManager.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "GameManager": () => (/* binding */ GameManager)
/* harmony export */ });
/* harmony import */ var _InputManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./InputManager */ "./src/ts/core/InputManager.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../common/AttributeType */ "./src/common/AttributeType.ts");
/* harmony import */ var _Utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Utils */ "./src/ts/core/Utils.ts");
/* harmony import */ var _WasmManager__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./WasmManager */ "./src/ts/core/WasmManager.ts");
/* harmony import */ var _renderer_Object3D__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../renderer/Object3D */ "./src/ts/renderer/Object3D.ts");
/* harmony import */ var _Clock__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./Clock */ "./src/ts/core/Clock.ts");
/* harmony import */ var _renderer_PipelineManager__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../renderer/PipelineManager */ "./src/ts/renderer/PipelineManager.ts");
/* harmony import */ var _renderer_TextureManager__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../renderer/TextureManager */ "./src/ts/renderer/TextureManager.ts");
/* harmony import */ var _renderer_Mesh__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../renderer/Mesh */ "./src/ts/renderer/Mesh.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../../common/ResourceType */ "./src/common/ResourceType.ts");
/* harmony import */ var _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ../renderer/MeshManager */ "./src/ts/renderer/MeshManager.ts");
/* harmony import */ var _renderer_geometry_BoxGeometry__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ../renderer/geometry/BoxGeometry */ "./src/ts/renderer/geometry/BoxGeometry.ts");
/* harmony import */ var _renderer_geometry_SphereGeometry__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ../renderer/geometry/SphereGeometry */ "./src/ts/renderer/geometry/SphereGeometry.ts");
/* harmony import */ var _renderer_geometry_PlaneGeometry__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ../renderer/geometry/PlaneGeometry */ "./src/ts/renderer/geometry/PlaneGeometry.ts");
/* harmony import */ var _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ./pipelines/resources/LightingResource */ "./src/ts/core/pipelines/resources/LightingResource.ts");
/* harmony import */ var _gameplay_Player__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! ../gameplay/Player */ "./src/ts/gameplay/Player.ts");

















const sampleCount = 4;
class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.buffers = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
    this.clock = new _Clock__WEBPACK_IMPORTED_MODULE_6__.Clock();
    this.updateCallbacks = [];
    window.addEventListener("resize", e => this.canvasSizeCache = this.canvasSize());
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  createBinding() {
    return {
      setupLights: this.setupLights.bind(this),
      renderComponents: this.renderComponents.bind(this),
      lock: this.lock.bind(this),
      unlock: this.unlock.bind(this)
    };
  }

  async init() {
    var _navigator$gpu;

    this.canvasSizeCache = this.canvasSize();
    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");
    this.inputManager = new _InputManager__WEBPACK_IMPORTED_MODULE_0__.InputManager(this.canvas);
    const adapter = await ((_navigator$gpu = navigator.gpu) === null || _navigator$gpu === void 0 ? void 0 : _navigator$gpu.requestAdapter());
    const device = await (adapter === null || adapter === void 0 ? void 0 : adapter.requestDevice());
    const context = this.canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: device,
      format: format,
      size: this.canvasSize(),
      compositingAlphaMode: "premultiplied"
    });
    this.device = device;
    this.context = context;
    this.format = format;
    await _renderer_TextureManager__WEBPACK_IMPORTED_MODULE_8__.textureManager.init(device);
    const size = this.canvasSize();
    this.onResize(size, false); // Initialize the wasm module

    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.init(this.canvas.width, this.canvas.height);
    this.initRuntime(); // Setup events

    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler);
    this.clock.start();
  }

  initRuntime() {
    _renderer_PipelineManager__WEBPACK_IMPORTED_MODULE_7__.pipelineManager.init(this);
    const containerLvl1Ptr = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.createLevel1();
    const geometrySphere = new _renderer_geometry_SphereGeometry__WEBPACK_IMPORTED_MODULE_13__.SphereGeometry(1, 64, 32).build(this);
    const geometryBox = new _renderer_geometry_BoxGeometry__WEBPACK_IMPORTED_MODULE_12__.BoxGeometry().build(this);
    const geometryPlane = new _renderer_geometry_PlaneGeometry__WEBPACK_IMPORTED_MODULE_14__.PlaneGeometry().build(this);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryBox, "skybox", "skybox")).transform);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometrySphere, "simple", "ball")).transform);

    for (let i = 0; i < 20; i++) _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryBox, "concrete", `building-${i}`)).transform);

    for (let i = 0; i < 20; i++) _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryBox, "crate", `crate-${i}`)).transform);

    this.character = new _renderer_Object3D__WEBPACK_IMPORTED_MODULE_5__.Object3D();
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryPlane, "coastal-floor", "floor")).transform);
    const containerTestPtr = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.createTestLevel();
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerTestPtr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryBox, "skybox", "skybox")).transform);
    const containerMainMenuPtr = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.createMainMenu();
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerMainMenuPtr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometrySphere, "earth")).transform);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerMainMenuPtr, _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.addMesh(this.createMesh(geometryBox, "stars", "skybox")).transform);
    this.player = new _gameplay_Player__WEBPACK_IMPORTED_MODULE_16__.Player();
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addAsset(containerLvl1Ptr, this.player.transformPtr);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addContainer(containerLvl1Ptr, false);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addContainer(containerMainMenuPtr, true);
    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.addContainer(containerTestPtr, false);
  }

  createMesh(geometry, pipelineName, name) {
    const pipeline = _renderer_PipelineManager__WEBPACK_IMPORTED_MODULE_7__.pipelineManager.getPipeline(pipelineName);
    const mesh = new _renderer_Mesh__WEBPACK_IMPORTED_MODULE_9__.Mesh(geometry, pipeline, this, name);
    return mesh;
  }

  dispose() {
    var _this$inputManager;

    this.disposed = true;
    window.removeEventListener("resize", this.onResizeHandler);
    (_this$inputManager = this.inputManager) === null || _this$inputManager === void 0 ? void 0 : _this$inputManager.dispose();
  }

  onResize(newSize) {
    let updateWasm = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

    // Destroy the previous render target
    if (this.renderTarget) {
      this.renderTarget.destroy();
      this.depthTexture.destroy();
    }

    this.presentationSize = newSize; // Reconfigure the canvas size.

    this.context.configure({
      device: this.device,
      format: this.format,
      size: this.presentationSize,
      compositingAlphaMode: "premultiplied"
    });
    this.renderTarget = this.device.createTexture({
      size: this.presentationSize,
      sampleCount,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.depthTexture = this.device.createTexture({
      size: this.presentationSize,
      format: "depth24plus",
      sampleCount: sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.renderTargetView = this.renderTarget.createView();
    if (updateWasm) _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.resize(this.canvas.width, this.canvas.height);
  }

  onFrame() {
    const clock = this.clock;
    window.requestAnimationFrame(this.onFrameHandler);
    const callbacks = this.updateCallbacks;

    for (const callback of callbacks) callback();

    if (this.disposed) return; // Check if we need to resize

    const [w, h] = this.presentationSize;
    const newSize = this.canvasSizeCache;

    if (newSize[0] !== w || newSize[1] !== h) {
      this.onResize(newSize);
    } // this.character.transform.translateZ(0.01);


    _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.update(clock.elapsedTime, clock.getDelta());
  }

  canvasSize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const size = [this.canvas.clientWidth * devicePixelRatio, this.canvas.clientHeight * devicePixelRatio];
    return size;
  }

  hasWebGPU() {
    if (!navigator.gpu) {
      return false;
    } else {
      return true;
    }
  }

  startPass() {
    const device = this.device;
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.renderTargetView,
        resolveTarget: this.context.getCurrentTexture().createView(),
        clearValue: {
          r: 0.0,
          g: 0.0,
          b: 0.0,
          a: 1.0
        },
        //background color
        storeOp: "store",
        loadOp: "clear"
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "store",
        depthClearValue: 1
      }
    });
    this.currentPass = renderPass;
    this.currentCommandEncoder = commandEncoder;
  }

  endPass() {
    this.currentPass.end();
    this.device.queue.submit([this.currentCommandEncoder.finish()]);
  }

  createBufferF32(data) {
    let usageFlag = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    const f32Array = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getFloat32Array(data);
    const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createBufferFromF32)(this.device, f32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(data) {
    let usageFlag = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;
    const u32Array = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getUint32Array(data);
    const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createIndexBufferU32)(this.device, u32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  renderComponents(camera, meshes) {
    this.startPass();
    let mesh;
    let pipeline;
    let pass = this.currentPass;
    let instances;
    let instance;
    const device = this.device;
    const projectionMatrix = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getFloat32Array(_WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getCameraProjectionMatrix(camera));

    for (let i = 0, l = meshes.length; i < l; i++) {
      const meshPtr = meshes[i] | 0;
      mesh = _renderer_MeshManager__WEBPACK_IMPORTED_MODULE_11__.meshManager.meshes.get(meshPtr);

      if (mesh) {
        var _instances, _instances2;

        // Set pipeline
        const newPipeline = mesh.pipeline;

        if (newPipeline.rebuild) {
          newPipeline.build(this);
          newPipeline.initialize(this);
        }

        pipeline = newPipeline;
        pass.setPipeline(pipeline.renderPipeline); // Set transform

        const template = pipeline.getTemplateByGroup(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Transform);
        instances = pipeline.groupInstances.get(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Transform);
        const transformBuffer = instances[mesh.transformIndex].buffers[0];
        if (template.projectionOffset !== -1) device.queue.writeBuffer(transformBuffer, template.projectionOffset, projectionMatrix);
        if (template.modelViewOffset !== -1) device.queue.writeBuffer(transformBuffer, template.modelViewOffset, mesh.modelViewMatrix);
        if (template.modelOffset !== -1) device.queue.writeBuffer(transformBuffer, template.modelOffset, mesh.worldMatrix);
        if (template.normalOffset !== -1) device.queue.writeBuffer(transformBuffer, template.normalOffset, mesh.normalMatrix); // Set transform bind group

        instances = pipeline.groupInstances.get(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Transform);
        instance = (_instances = instances) === null || _instances === void 0 ? void 0 : _instances[mesh.transformIndex];
        if (instance) pass.setBindGroup(instance.group, instance.bindGroup); // Set material bind group

        instances = pipeline.groupInstances.get(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Material);
        instance = (_instances2 = instances) === null || _instances2 === void 0 ? void 0 : _instances2[0];
        if (instance) pass.setBindGroup(instance.group, instance.bindGroup); // Set attribute buffers

        if (mesh.geometry && mesh.pipeline) {
          const attributeMap = mesh.geometry.attributes;
          const slotMap = mesh.slotMap;

          if (attributeMap) {
            if (attributeMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION) && slotMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION)) {
              pass.setVertexBuffer(slotMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION), attributeMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION).gpuBuffer);
            }

            if (attributeMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL) && slotMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL)) {
              pass.setVertexBuffer(slotMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL), attributeMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL).gpuBuffer);
            }

            if (attributeMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV) && slotMap.has(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV)) {
              pass.setVertexBuffer(slotMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV), attributeMap.get(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV).gpuBuffer);
            }

            if (mesh.geometry.indexBuffer) {
              pass.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
              pass.drawIndexed(mesh.geometry.indices.length);
            } else {}
          }
        }
      }
    }

    this.endPass();
  }

  setupLights(numDirectionLights, configArrayPtr, sceneArrayPtr, directionArrayPtr) {
    const pipelines = _renderer_PipelineManager__WEBPACK_IMPORTED_MODULE_7__.pipelineManager.pipelines;
    let buffer;
    const device = this.device;

    if (_pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.numDirLights !== numDirectionLights) {
      _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.numDirLights = numDirectionLights;
      _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.rebuildDirectionLights = true;
      pipelines.forEach(p => {
        if (p.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_10__.ResourceType.Material)) {
          p.defines = { ...p.defines,
            NUM_DIR_LIGHTS: numDirectionLights
          };
        }
      });
    }

    buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.lightingConfig;

    if (buffer) {
      const info = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getUint32Array(configArrayPtr);
      device.queue.writeBuffer(buffer, 0, info);
    }

    buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.sceneLightingBuffer;

    if (buffer) {
      const ambientLights = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getFloat32Array(sceneArrayPtr);
      device.queue.writeBuffer(buffer, 0, ambientLights);
    }

    buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_15__.LightingResource.directionLightsBuffer;

    if (buffer) {
      const dirLights = _WasmManager__WEBPACK_IMPORTED_MODULE_4__.wasm.getFloat32Array(directionArrayPtr);
      device.queue.writeBuffer(buffer, 0, dirLights);
    }
  }

}

/***/ }),

/***/ "./src/ts/core/InputManager.ts":
/*!*************************************!*\
  !*** ./src/ts/core/InputManager.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "InputManager": () => (/* binding */ InputManager),
/* harmony export */   "KeyEventType": () => (/* binding */ KeyEventType),
/* harmony export */   "MouseEventType": () => (/* binding */ MouseEventType)
/* harmony export */ });
/* harmony import */ var _WasmManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./WasmManager */ "./src/ts/core/WasmManager.ts");

let MouseEventType;

(function (MouseEventType) {
  MouseEventType[MouseEventType["MouseDown"] = 0] = "MouseDown";
  MouseEventType[MouseEventType["MouseUp"] = 1] = "MouseUp";
  MouseEventType[MouseEventType["MouseMove"] = 2] = "MouseMove";
  MouseEventType[MouseEventType["MouseWheel"] = 3] = "MouseWheel";
})(MouseEventType || (MouseEventType = {}));

let KeyEventType;

(function (KeyEventType) {
  KeyEventType[KeyEventType["KeyDown"] = 0] = "KeyDown";
  KeyEventType[KeyEventType["KeyUp"] = 1] = "KeyUp";
})(KeyEventType || (KeyEventType = {}));

class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvasBounds = canvas.getBoundingClientRect();
    this.onDownHandler = this.onDown.bind(this);
    this.onUpHandler = this.onUp.bind(this);
    this.onKeyDownHandler = this.onKeyDown.bind(this);
    this.onKeyUpHandler = this.onKeyUp.bind(this);
    this.onMoveHandler = this.onMove.bind(this);
    this.onWheelHandler = this.onWheel.bind(this);
    this.onPointerlockChangeHandler = this.onPointerlockChange.bind(this);
    this.onPointerlockErrorHandler = this.onPointerlockError.bind(this);
    this.canvas.addEventListener("mousedown", this.onDownHandler);
    window.addEventListener("wheel", this.onWheelHandler);
    window.addEventListener("mouseup", this.onUpHandler);
    window.addEventListener("mousemove", this.onMoveHandler);
    document.addEventListener("keydown", this.onKeyDownHandler);
    document.addEventListener("keyup", this.onKeyUpHandler);
    document.addEventListener("pointerlockchange", this.onPointerlockChangeHandler);
    document.addEventListener("pointerlockerror", this.onPointerlockErrorHandler);
    this.reset();
  }

  onPointerlockChange() {
    if (document.pointerLockElement === this.canvas) {} else {
      // Signal escape was pushed
      this.sendKeyEvent(KeyEventType.KeyUp, {
        code: "Escape"
      });
    }
  }

  onPointerlockError() {
    console.error("Unable to use Pointer Lock API");
  }

  reset() {
    this.canvasBounds = this.canvas.getBoundingClientRect();
  }

  onUp(e) {
    this.sendMouseEvent(MouseEventType.MouseUp, e, this.canvasBounds, 0);
  }

  onMove(e) {
    this.sendMouseEvent(MouseEventType.MouseMove, e, this.canvasBounds, 0);
  }

  onDown(e) {
    e.preventDefault();
    this.sendMouseEvent(MouseEventType.MouseDown, e, this.canvasBounds, 0);
  }

  onKeyDown(e) {
    this.sendKeyEvent(KeyEventType.KeyDown, e);
  }

  onKeyUp(e) {
    e.preventDefault();
    this.sendKeyEvent(KeyEventType.KeyUp, e);
  }

  onWheel(e) {
    this.sendMouseEvent(MouseEventType.MouseWheel, e, this.canvasBounds, e.deltaY);
  }

  createMouseEvent(e, bounds) {
    let delta = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    return _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createMouseEvent(e.clientX, e.clientY, e.pageX, e.pageY, e.ctrlKey, e.shiftKey, e.altKey, e.button, e.buttons, bounds.x, bounds.y, bounds.width, bounds.height, delta, e.movementX || 0, e.movementY || 0);
  }

  sendMouseEvent(type, event, bounds, delta) {
    const wasmEvent = this.createMouseEvent(event, bounds, delta);
    if (type === MouseEventType.MouseUp) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnMouseDown(wasmEvent);else if (type === MouseEventType.MouseMove) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnMouseMove(wasmEvent);else if (type === MouseEventType.MouseDown) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnMouseDown(wasmEvent);else if (type === MouseEventType.MouseWheel) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnWheel(wasmEvent);
  }

  sendKeyEvent(type, event) {
    const wasmEvent = _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createKeyboardEvent(event.code);
    if (type === KeyEventType.KeyUp) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnKeyUp(wasmEvent);else if (type === KeyEventType.KeyDown) _WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.dispatchOnKeyDown(wasmEvent);
  }

  dispose() {
    this.canvas.removeEventListener("mousedown", this.onDownHandler);
    window.removeEventListener("mouseup", this.onUpHandler);
    window.removeEventListener("wheel", this.onWheelHandler);
    window.removeEventListener("mousemove", this.onMoveHandler);
    document.removeEventListener("keydown", this.onKeyDownHandler);
    document.removeEventListener("keyup", this.onKeyUpHandler);
    document.removeEventListener("pointerlockchange", this.onPointerlockChangeHandler);
    document.removeEventListener("pointerlockerror", this.onPointerlockErrorHandler);
  }

}

/***/ }),

/***/ "./src/ts/core/UIEventManager.ts":
/*!***************************************!*\
  !*** ./src/ts/core/UIEventManager.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "UIEventManager": () => (/* binding */ UIEventManager)
/* harmony export */ });
/* harmony import */ var _EventDispatcher__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./EventDispatcher */ "./src/ts/core/EventDispatcher.ts");
/* harmony import */ var _events_UIEvent__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./events/UIEvent */ "./src/ts/core/events/UIEvent.ts");
/* harmony import */ var _WasmManager__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./WasmManager */ "./src/ts/core/WasmManager.ts");



const uiEvent = new _events_UIEvent__WEBPACK_IMPORTED_MODULE_1__.UIEvent();
class UIEventManager extends _EventDispatcher__WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor() {
    super();
  }

  createBinding() {
    return {
      onSignalReceived: this.onSignalReceived.bind(this)
    };
  }

  onSignalReceived(type, event) {
    uiEvent.uiEventType = type;
    this.dispatchEvent(uiEvent);
  }

  triggerUIEvent(type) {
    _WasmManager__WEBPACK_IMPORTED_MODULE_2__.wasm.dispatchOnSignalEvent(type);
  }

}

/***/ }),

/***/ "./src/ts/core/Utils.ts":
/*!******************************!*\
  !*** ./src/ts/core/Utils.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "createBuffer": () => (/* binding */ createBuffer),
/* harmony export */   "createBufferFromF32": () => (/* binding */ createBufferFromF32),
/* harmony export */   "createIndexBufferU32": () => (/* binding */ createIndexBufferU32)
/* harmony export */ });
function createBufferFromF32(device, data) {
  let usageFlag = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}
function createBuffer(device, data) {
  let usageFlag = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true
  });
  var dst = buffer.getMappedRange();
  new Uint8Array(dst).set(new Uint8Array(data));
  buffer.unmap();
  return buffer;
}
function createIndexBufferU32(device, data) {
  let usageFlag = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    // mappedAtCreation is true so we can interact with it via the CPU
    mappedAtCreation: true
  });
  new Uint32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

/***/ }),

/***/ "./src/ts/core/WasmManager.ts":
/*!************************************!*\
  !*** ./src/ts/core/WasmManager.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "WasmManager": () => (/* binding */ WasmManager),
/* harmony export */   "wasm": () => (/* binding */ wasm),
/* harmony export */   "wasmManager": () => (/* binding */ wasmManager)
/* harmony export */ });
/* harmony import */ var _build_release__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../build/release */ "./build/release.js");
/* harmony import */ var _build_release_wasm__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../build/release.wasm */ "./build/release.wasm");


let wasmManager;
let wasm;
class WasmManager {
  constructor() {
    wasmManager = this;
  }

  __liftTypedArray(constructor, pointer) {
    const memoryU32 = this.memoryU32;
    return new constructor(this.memory.buffer, memoryU32[pointer + 4 >>> 2], memoryU32[pointer + 8 >>> 2] / constructor.BYTES_PER_ELEMENT);
  }

  async load(bindables) {
    // Creating WASM with Linear memory
    this.memory = new WebAssembly.Memory({
      initial: 10000
    });
    this.memoryU32 = new Uint32Array(this.memory.buffer);
    const bindings = {};

    for (const bindable of bindables) Object.assign(bindings, bindable.createBinding());

    const obj = await (0,_build_release__WEBPACK_IMPORTED_MODULE_0__.instantiate)(await WebAssembly.compileStreaming(fetch(_build_release_wasm__WEBPACK_IMPORTED_MODULE_1__["default"])), {
      Imports: bindings,
      env: {
        memory: this.memory
      }
    });

    obj.getFloat32Array = pointer => this.__liftTypedArray(Float32Array, pointer.valueOf() >>> 0);

    obj.getUint32Array = pointer => this.__liftTypedArray(Uint32Array, pointer.valueOf() >>> 0);

    obj.getInt32Array = pointer => this.__liftTypedArray(Int32Array, pointer.valueOf() >>> 0);

    this.exports = obj;
    wasm = obj;
    this.wasmMemoryBlock = this.memory.buffer;
    this.wasmArrayBuffer = new Uint32Array(this.wasmMemoryBlock);
  }

}

/***/ }),

/***/ "./src/ts/core/events/UIEvent.ts":
/*!***************************************!*\
  !*** ./src/ts/core/events/UIEvent.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "UIEvent": () => (/* binding */ UIEvent)
/* harmony export */ });
/* harmony import */ var _EventDispatcher__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../EventDispatcher */ "./src/ts/core/EventDispatcher.ts");

class UIEvent extends _EventDispatcher__WEBPACK_IMPORTED_MODULE_0__.DispatchableEvent {
  constructor() {
    super("uievent");
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/Pipeline.ts":
/*!*******************************************!*\
  !*** ./src/ts/core/pipelines/Pipeline.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "GroupMapping": () => (/* binding */ GroupMapping),
/* harmony export */   "Pipeline": () => (/* binding */ Pipeline)
/* harmony export */ });
/* harmony import */ var _resources_PipelineResourceInstance__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./resources/PipelineResourceInstance */ "./src/ts/core/pipelines/resources/PipelineResourceInstance.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");




class GroupMapping {
  constructor(index) {
    this.index = index;
    this.bindingCount = 0;
  }

  getBinding() {
    const toRet = this.bindingCount;
    this.bindingCount++;
    return toRet;
  }

}
class Pipeline {
  constructor(name, vertexSource, fragmentSource, defines) {
    this.name = name;
    this.renderPipeline = null;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.resourceTemplates = [];
    this.groupInstances = new Map();
    this.defines = defines;
    this.rebuild = true;
    this.groupMapping = new Map();
    this.groups = 0;
    this.topology = "triangle-list";
    this.cullMode = "back";
    this.frontFace = "ccw";
    this.depthFormat = "depth24plus";
    this.depthWriteEnabled = true;
    this.depthCompare = "less";
  }

  set defines(defines) {
    this._defines = defines;
    this.rebuild = true;
  }

  get defines() {
    return this._defines;
  }

  groupIndex(type) {
    if (this.groupMapping.has(type)) return this.groupMapping.get(type).index;else {
      const groupMapping = new GroupMapping(this.groups);
      this.groupMapping.set(type, groupMapping);
      this.groups++;
      return groupMapping.index;
    }
  }

  bindingIndex(type) {
    if (this.groupMapping.has(type)) {
      const groupMapping = this.groupMapping.get(type);
      return groupMapping.getBinding();
    } else {
      const groupMapping = new GroupMapping(this.groups);
      this.groupMapping.set(type, groupMapping);
      this.groups++;
      return groupMapping.getBinding();
    }
  }
  /** Use this function to add resource templates */


  getTemplateByType(type, id) {
    if (id) return this.resourceTemplates.find(t => t.resourceType === type && id === t.id);else return this.resourceTemplates.find(t => t.resourceType === type);
  }

  getTemplateByGroup(type) {
    return this.resourceTemplates.find(t => t.groupType === type);
  }

  addTemplate(template) {
    this.resourceTemplates.push(template);
    return this;
  }

  build(gameManager) {
    this.rebuild = false;
    const groupInstanceMap = this.groupInstances;
    const templates = this.resourceTemplates; // Destroy previous instances

    templates.forEach(template => {
      const resourceInstances = groupInstanceMap.get(template.groupType);
      resourceInstances === null || resourceInstances === void 0 ? void 0 : resourceInstances.forEach(i => {
        i.dispose();
      });
    }); // Reset

    templates.splice(0, templates.length);
    this.groupMapping.clear();
    this.groups = 0;
    this.onAddResources();
    let curBinding = 0;
    const binds = new Map();
    templates.forEach(resourceTemplate => {
      const groupIndex = this.groupIndex(resourceTemplate.groupType);
      if (!binds.has(groupIndex)) binds.set(groupIndex, 0);
      curBinding = binds.get(groupIndex);
      const template = resourceTemplate.build(gameManager, this, curBinding);
      curBinding += template.bindings.length;
      binds.set(groupIndex, curBinding);
      resourceTemplate.template = template;
    }); // Build the shaders - should go after adding the resources as we might use those in the shader source

    const vertSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_2__.shaderBuilder)(this.vertexSource, this);
    const fragSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_2__.shaderBuilder)(this.fragmentSource, this);
    this.renderPipeline = gameManager.device.createRenderPipeline({
      layout: "auto",
      primitive: {
        topology: this.topology,
        cullMode: this.cullMode,
        frontFace: this.frontFace
      },
      depthStencil: {
        format: this.depthFormat,
        depthWriteEnabled: this.depthWriteEnabled,
        depthCompare: this.depthCompare
      },
      multisample: {
        count: 4
      },
      label: this.name,
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource
        }),
        entryPoint: "main",
        buffers: this.vertexLayouts.map(layout => ({
          arrayStride: layout.arrayStride,
          stepMode: layout.stepMode,
          attributes: layout.attributes
        }))
      },
      fragment: {
        module: gameManager.device.createShaderModule({
          code: fragSource
        }),
        entryPoint: "main",
        targets: [{
          format: gameManager.format
        }]
      }
    });
  }

  initialize(gameManager) {
    const templates = this.resourceTemplates;
    const groupInstances = this.groupInstances;
    const prevGroupKeys = Array.from(this.groupInstances.keys());
    const uniqueNewGroupKeys = templates.map(r => r.groupType).filter((value, index, self) => self.indexOf(value) === index);
    const groupCache = new Map(); // Remove any unused instances

    prevGroupKeys.forEach(key => {
      if (!uniqueNewGroupKeys.includes(key)) groupInstances.delete(key);
    }); // Initialize temp cache maps

    for (const newKey of uniqueNewGroupKeys) {
      let numInstancesToCreate = 0;
      let instances; // If we previously had instances, then save the number of them
      // as we have to re-create the same amount as before. Otherwise just create 1;

      if (groupInstances.has(newKey)) {
        instances = groupInstances.get(newKey);
        numInstancesToCreate = instances.length;
        instances.splice(0, instances.length);
      } else {
        numInstancesToCreate = 1;
        instances = [];
        groupInstances.set(newKey, instances);
      }

      groupCache.set(newKey, {
        bindData: new Map(),
        numInstances: numInstancesToCreate
      });
    } // Initialize each template


    templates.forEach(resourceTemplate => {
      const {
        bindData,
        numInstances
      } = groupCache.get(resourceTemplate.groupType);

      for (let i = 0; i < numInstances; i++) if (bindData.has(i)) {
        bindData.get(i).push(resourceTemplate.getBindingData(gameManager, this.renderPipeline));
      } else {
        bindData.set(i, [resourceTemplate.getBindingData(gameManager, this.renderPipeline)]);
      }
    }); // Create the instances & bind groups

    groupCache.forEach((cache, groupType) => {
      const instances = new Array(cache.numInstances);
      const groupIndex = this.groupIndex(groupType);

      for (let i = 0; i < cache.numInstances; i++) {
        let buffers = null; // Join all the entries from each template
        // Also join all the collect each of the buffers we want to cache for the render queue

        const entries = cache.bindData.get(i).reduce((accumulator, cur) => {
          if (cur.buffer) {
            if (!buffers) buffers = [cur.buffer];else buffers.push(cur.buffer);
          }

          accumulator.push(...cur.binds);
          return accumulator;
        }, []);
        const bindGroup = gameManager.device.createBindGroup({
          label: _common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType[groupType],
          layout: this.renderPipeline.getBindGroupLayout(groupIndex),
          entries
        });
        instances[i] = new _resources_PipelineResourceInstance__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceInstance(groupIndex, bindGroup, buffers);
      }

      groupInstances.set(groupType, instances);
    });
  }

  addResourceInstance(manager, type) {
    const template = this.getTemplateByGroup(type);

    if (template) {
      const bindingData = template.getBindingData(manager, this.renderPipeline);
      const groupIndex = this.groupIndex(type);
      const bindGroup = manager.device.createBindGroup({
        label: _common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType[type],
        layout: this.renderPipeline.getBindGroupLayout(groupIndex),
        entries: bindingData.binds
      });
      const instances = new _resources_PipelineResourceInstance__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceInstance(groupIndex, bindGroup, bindingData.buffer ? [bindingData.buffer] : null);
      const instanceArray = this.groupInstances.get(type);
      instanceArray.push(instances);
      return instanceArray.length - 1;
    } else throw new Error("Pipeline does not use resource type");
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/VertexAttribute.ts":
/*!**************************************************!*\
  !*** ./src/ts/core/pipelines/VertexAttribute.ts ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "VertexAttribute": () => (/* binding */ VertexAttribute)
/* harmony export */ });
class VertexAttribute {
  constructor(attributeType, shaderLocation, format, offset) {
    this.attributeType = attributeType;
    this.shaderLocation = shaderLocation;
    this.format = format;
    this.offset = offset;
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/VertexBufferLayout.ts":
/*!*****************************************************!*\
  !*** ./src/ts/core/pipelines/VertexBufferLayout.ts ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "VertexBufferLayout": () => (/* binding */ VertexBufferLayout)
/* harmony export */ });
class VertexBufferLayout {
  constructor(arrayStride, attributes, stepMode) {
    this.arrayStride = arrayStride;
    this.attributes = attributes;
    this.stepMode = stepMode;
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/debug-pipeline/DebugPipeline.ts":
/*!***************************************************************!*\
  !*** ./src/ts/core/pipelines/debug-pipeline/DebugPipeline.ts ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "DebugPipeline": () => (/* binding */ DebugPipeline)
/* harmony export */ });
/* harmony import */ var _Pipeline__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../Pipeline */ "./src/ts/core/pipelines/Pipeline.ts");
/* harmony import */ var _resources_LightingResource__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../resources/LightingResource */ "./src/ts/core/pipelines/resources/LightingResource.ts");
/* harmony import */ var _resources_MaterialResource__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../resources/MaterialResource */ "./src/ts/core/pipelines/resources/MaterialResource.ts");
/* harmony import */ var _resources_TextureResource__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../resources/TextureResource */ "./src/ts/core/pipelines/resources/TextureResource.ts");
/* harmony import */ var _resources_TransformResource__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../resources/TransformResource */ "./src/ts/core/pipelines/resources/TransformResource.ts");
/* harmony import */ var _DebugPipelineVS__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./DebugPipelineVS */ "./src/ts/core/pipelines/debug-pipeline/DebugPipelineVS.ts");
/* harmony import */ var _DebugPipelineFS__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./DebugPipelineFS */ "./src/ts/core/pipelines/debug-pipeline/DebugPipelineFS.ts");
/* harmony import */ var _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../VertexBufferLayout */ "./src/ts/core/pipelines/VertexBufferLayout.ts");
/* harmony import */ var _VertexAttribute__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../VertexAttribute */ "./src/ts/core/pipelines/VertexAttribute.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../../../../common/AttributeType */ "./src/common/AttributeType.ts");










class DebugPipeline extends _Pipeline__WEBPACK_IMPORTED_MODULE_0__.Pipeline {
  constructor(name, defines) {
    super(name, _DebugPipelineVS__WEBPACK_IMPORTED_MODULE_5__.vertexShader, _DebugPipelineFS__WEBPACK_IMPORTED_MODULE_6__.fragmentShader, defines);
    this.vertexLayouts = [new _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_7__.VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [new _VertexAttribute__WEBPACK_IMPORTED_MODULE_8__.VertexAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_9__.AttributeType.POSITION, 0, "float32x3", 0)]), new _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_7__.VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [new _VertexAttribute__WEBPACK_IMPORTED_MODULE_8__.VertexAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_9__.AttributeType.NORMAL, 1, "float32x3", 0)]), new _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_7__.VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 2, [new _VertexAttribute__WEBPACK_IMPORTED_MODULE_8__.VertexAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_9__.AttributeType.UV, 2, "float32x2", 0)])];
  }

  onAddResources() {
    const transformResource = new _resources_TransformResource__WEBPACK_IMPORTED_MODULE_4__.TransformResource(_resources_TransformResource__WEBPACK_IMPORTED_MODULE_4__.TransformType.Projection | _resources_TransformResource__WEBPACK_IMPORTED_MODULE_4__.TransformType.ModelView | _resources_TransformResource__WEBPACK_IMPORTED_MODULE_4__.TransformType.Normal);
    this.addTemplate(transformResource);
    const materialResource = new _resources_MaterialResource__WEBPACK_IMPORTED_MODULE_2__.MaterialResource();
    this.addTemplate(materialResource);
    const lightingResource = new _resources_LightingResource__WEBPACK_IMPORTED_MODULE_1__.LightingResource();
    this.addTemplate(lightingResource);

    if (this.defines.diffuseMap) {
      const resource = new _resources_TextureResource__WEBPACK_IMPORTED_MODULE_3__.TextureResource(this.defines.diffuseMap, "diffuse");
      this.addTemplate(resource);
    }

    if (this.defines.normalMap) {
      const resource = new _resources_TextureResource__WEBPACK_IMPORTED_MODULE_3__.TextureResource(this.defines.normalMap, "normal");
      this.addTemplate(resource);
    }
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/debug-pipeline/DebugPipelineFS.ts":
/*!*****************************************************************!*\
  !*** ./src/ts/core/pipelines/debug-pipeline/DebugPipelineFS.ts ***!
  \*****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "fragmentShader": () => (/* binding */ fragmentShader)
/* harmony export */ });
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");
/* harmony import */ var _shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../shader-lib/MathFunctions */ "./src/ts/core/pipelines/shader-lib/MathFunctions.ts");


 // prettier-ignore

const fragmentShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__.shader`

${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Lighting).template.fragmentBlock}
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Material).template.fragmentBlock}
${e => e.defines.diffuseMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Texture, 'diffuse').template.fragmentBlock : ''}
${e => e.defines.normalMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Texture, 'normal').template.fragmentBlock : ''}

// INTERNAL STRUCTS
struct IncidentLight {
  color: vec3<f32>,
  direction: vec3<f32>,
  visible: bool
};

struct ReflectedLight {
  directDiffuse: vec3<f32>,
  directSpecular: vec3<f32>,
  indirectDiffuse: vec3<f32>,
  indirectSpecular: vec3<f32>
};

struct PhysicalMaterial {
  diffuseColor: vec3<f32>,
  specularColor: vec3<f32>,
  roughness: f32,
  specularF90: f32
};

struct GeometricContext {
  position: vec3<f32>,
  normal: vec3<f32>,
  viewDir: vec3<f32>
};

struct DirectionalLight {
  direction: vec3<f32>,
  color: vec3<f32>
};

${_shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_2__.mathConstants}
${_shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_2__.mathFunctions}

fn packNormalToRGB( normal: vec3<f32> ) -> vec3<f32> {
  return normalize( normal ) * 0.5 + 0.5;
}

fn getDirectionalLightInfo( directionalLight: DirectionalLight, geometry: GeometricContext, light: ptr<function, IncidentLight> ) {
  (*light).color = directionalLight.color;
  (*light).direction = directionalLight.direction;
  (*light).visible = true;
}

fn BRDF_Lambert( diffuseColor: vec3<f32> ) -> vec3<f32> {
  return RECIPROCAL_PI * diffuseColor;
}

fn F_Schlick( f0: vec3<f32>, f90: f32, dotVH: f32  ) -> vec3<f32> {
  var fresnel: f32 = exp2( ( -5.55473 * dotVH - 6.98316 ) * dotVH );
  return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}

fn V_GGX_SmithCorrelated( alpha: f32, dotNL: f32, dotNV: f32 ) -> f32 {
  var a2: f32 = pow2( alpha );
  var gv: f32 = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
  var gl: f32 = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
  return 0.5 / max( gv + gl, EPSILON );
}

fn D_GGX( alpha: f32, dotNH: f32 ) -> f32 {
  var a2: f32 = pow2( alpha );
  var denom: f32 = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
  return RECIPROCAL_PI * a2 / pow2( denom );
}

fn BRDF_GGX( lightDir: vec3<f32>, viewDir: vec3<f32>, normal: vec3<f32>, f0: vec3<f32>, f90: f32, roughness: f32 ) -> vec3<f32> {
  var alpha: f32 = pow2( roughness );
  var halfDir: vec3<f32> = normalize( lightDir + viewDir );
  var dotNL: f32 = saturate( dot( normal, lightDir ) );
  var dotNV: f32 = saturate( dot( normal, viewDir ) );
  var dotNH: f32 = saturate( dot( normal, halfDir ) );
  var dotVH: f32 = saturate( dot( viewDir, halfDir ) );
  var F: vec3<f32> = F_Schlick( f0, f90, dotVH );
  var V: f32 = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
  var D: f32 = D_GGX( alpha, dotNH );
  return F * ( V * D );
}

fn DFGApprox( normal: vec3<f32>, viewDir: vec3<f32>, roughness: f32 ) -> vec2<f32> {
  var dotNV = saturate( dot( normal, viewDir ) );
  var c0 = vec4<f32>( -1.0, - 0.0275, - 0.572, 0.022 );
  var c1 = vec4<f32>( 1.0, 0.0425, 1.04, - 0.04 );
  var r = roughness * c0 + c1;
  var a004: f32 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
  var fab = vec2<f32>( - 1.04, 1.04 ) * a004 + r.zw;
  return fab;
}

fn computeMultiscattering( normal: vec3<f32>, viewDir: vec3<f32>, specularColor: vec3<f32>, specularF90: f32, roughness: f32, singleScatter: ptr<function, vec3<f32>>, multiScatter: ptr<function, vec3<f32>> ) {
  var fab = DFGApprox( normal, viewDir, roughness );
  var FssEss = specularColor * fab.x + specularF90 * fab.y;
  var Ess = fab.x + fab.y;
  var Ems = 1.0 - Ess;
  var Favg = specularColor + ( 1.0 - specularColor ) * 0.047619;
  var Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
  (*singleScatter) = (*singleScatter) + FssEss;
  (*multiScatter) = (*multiScatter) + (Fms * Ems);
}

fn RE_Direct_Physical( directLight: IncidentLight, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  var dotNL: f32 = saturate( dot( geometry.normal, directLight.direction ) );
  var irradiance: vec3<f32> = dotNL * directLight.color;
  // #ifdef USE_CLEARCOAT
  //     var dotNLcc: f32 = saturate( dot( geometry.clearcoatNormal, directLight.direction ) );
  //     var ccIrradiance: vec3<f32> = dotNLcc * directLight.color;
  //     clearcoatSpecular = clearcoatSpecular + ccIrradiance * BRDF_GGX( directLight.direction, geometry.viewDir, geometry.clearcoatNormal, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
  // #endif
  // #ifdef USE_SHEEN
  //     (*reflectedLight).directSpecular = (*reflectedLight).directSpecular + irradiance * BRDF_Sheen( directLight.direction, geometry.viewDir, geometry.normal, material.sheenColor, material.sheenRoughness );
  // #endif
  (*reflectedLight).directSpecular = (*reflectedLight).directSpecular + irradiance * BRDF_GGX( directLight.direction, geometry.viewDir, geometry.normal, material.specularColor, material.specularF90, material.roughness );
  (*reflectedLight).directDiffuse = (*reflectedLight).directDiffuse + irradiance * BRDF_Lambert( material.diffuseColor );
}

fn RE_IndirectDiffuse_Physical( irradiance: vec3<f32>, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  (*reflectedLight).indirectDiffuse = (*reflectedLight).indirectDiffuse + (irradiance * BRDF_Lambert( material.diffuseColor ));
}

fn RE_IndirectSpecular_Physical( radiance: vec3<f32>, irradiance: vec3<f32>, clearcoatRadiance: vec3<f32>, geometry: GeometricContext, material: PhysicalMaterial, reflectedLight: ptr<function, ReflectedLight> ) {
  // #ifdef USE_CLEARCOAT
  //     clearcoatSpecular = clearcoatSpecular + (clearcoatRadiance * EnvironmentBRDF( geometry.clearcoatNormal, geometry.viewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness ));
  // #endif
  var singleScattering = vec3<f32>( 0.0 );
  var multiScattering = vec3<f32>( 0.0 );
  var cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
  computeMultiscattering( geometry.normal, geometry.viewDir, material.specularColor, material.specularF90, material.roughness, &singleScattering, &multiScattering );
  var diffuse = material.diffuseColor * ( 1.0 - ( singleScattering + multiScattering ) );
  (*reflectedLight).indirectSpecular = (*reflectedLight).indirectSpecular + (radiance * singleScattering);
  (*reflectedLight).indirectSpecular = (*reflectedLight).indirectSpecular + (multiScattering * cosineWeightedIrradiance);
  (*reflectedLight).indirectDiffuse = (*reflectedLight).indirectDiffuse + (diffuse * cosineWeightedIrradiance);
}

fn changeDiffuseToRed( colorPtr: ptr<function, vec4<f32>> ) {
  (*colorPtr).g = 0.0;
  (*colorPtr).b = 0.0;
}

@stage(fragment)
fn main(
  @location(0) vFragUV: vec2<f32>,
  @location(1) vNormal : vec3<f32>,
  @location(2) vViewPosition : vec3<f32>
) -> @location(0) vec4<f32> {

  var normal = normalize( vNormal );
  var geometryNormal = normal;

  var totalEmissiveRadiance: vec3<f32> = materialData.emissive.xyz;
  var diffuseColor = vec4<f32>( materialData.diffuse.xyz, materialData.opacity );
  var reflectedLight: ReflectedLight = ReflectedLight( vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ) );

  ${e => e.defines.diffuseMap && `var texelColor = textureSample(diffuseTexture, diffuseSampler, vFragUV);
  diffuseColor = diffuseColor * texelColor;`}

  // TODO: Alpha test - discard early

  // Metalness
  var metalnessFactor: f32 = materialData.metalness;
  // TODO:
  ${e => e.defines.metalnessMap && `vec4 texelMetalness = = textureSample(metalnessMap, mySampler, vFragUV);
    metalnessFactor *= texelMetalness.b;`}

  // Roughness
  var roughnessFactor: f32 = materialData.roughness;
  // TODO:
  ${e => e.defines.roughnessMap && `vec4 texelRoughness = textureSample(roughnessMap, mySampler, vFragUV);
    roughnessFactor *= texelRoughness.b;`}

  var isOrthographic = false;
  var geometry: GeometricContext;
  geometry.position = -vViewPosition;
  geometry.normal = normal;
  geometry.viewDir =  select(normalize( vViewPosition ), vec3<f32>( 0.0, 0.0, 1.0 ), isOrthographic ); // Same as ternary operator (select( false, true, condition ))

  var directLight: IncidentLight;
  var material: PhysicalMaterial;

  material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );

  var dxy: vec3<f32> = max( abs( dpdx( geometryNormal ) ), abs( dpdy( geometryNormal ) ) );
  var geometryRoughness: f32 = max( max( dxy.x, dxy.y ), dxy.z );

  material.roughness = max( roughnessFactor, 0.0525 );
  material.roughness = material.roughness + geometryRoughness;
  material.roughness = min( material.roughness, 1.0 );

  // #ifdef IOR
  //     #ifdef SPECULAR
  //         float specularIntensityFactor = specularIntensity;
  //         vec3 specularColorFactor = specularColor;
  //         #ifdef USE_SPECULARINTENSITYMAP
  //             specularIntensityFactor *= texture2D( specularIntensityMap, vUv ).a;
  //         #endif
  //         #ifdef USE_SPECULARCOLORMAP
  //             specularColorFactor *= specularColorMapTexelToLinear( texture2D( specularColorMap, vUv ) ).rgb;
  //         #endif
  //         material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
  //     #else
  //         float specularIntensityFactor = 1.0;
  //         vec3 specularColorFactor = vec3( 1.0 );
  //         material.specularF90 = 1.0;
  //     #endif
  //     material.specularColor = mix( min( pow2( ( ior - 1.0 ) / ( ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
  // #else
      material.specularColor = mix( vec3<f32>( 0.04 ), diffuseColor.rgb, metalnessFactor );
      material.specularF90 = 1.0;
  // #endif


  // Lighting
  // ========
  var numDirectionalLights = lightingConfigUniform.numDirectionalLights;

  ${e => e.defines.NUM_DIR_LIGHTS ? `
  for (var i : u32 = 0u; i < numDirectionalLights; i = i + 1u) {
    var directionalLight: DirectionalLight;
    directionalLight.direction = directionLightsUniform.directionalLights[i].direction.xyz;
    directionalLight.color = directionLightsUniform.directionalLights[i].color.xyz;

    getDirectionalLightInfo( directionalLight, geometry, &directLight );
    RE_Direct_Physical( directLight, geometry, material, &reflectedLight );
  }` : ''}

  // #if defined( RE_IndirectDiffuse )
  var iblIrradiance = vec3<f32>( 0.0 );
  var irradiance = sceneLightingUniform.ambientLightColor.xyz;

  // TODO
  // irradiance = irradiance + getLightProbeIrradiance( lightProbe, geometry.normal );

  // #if defined( RE_IndirectSpecular )
  var radiance = vec3<f32>( 0.0 );
  var clearcoatRadiance = vec3<f32>( 0.0 );

  // #if defined( RE_IndirectDiffuse )
    // #ifdef USE_LIGHTMAP
    //   vec4 lightMapTexel = texture2D( lightMap, vUv2 );
    //   vec3 lightMapIrradiance = lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
    //   #ifndef PHYSICALLY_CORRECT_LIGHTS
    //       lightMapIrradiance *= PI;
    //   #endif
    //   irradiance = irradiance + lightMapIrradiance;
    // #endif
    // #if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
    //   iblIrradiance = iblIrradiance + getIBLIrradiance( geometry.normal );
    // #endif
  // #endif

  // #if defined( RE_IndirectDiffuse )
    RE_IndirectDiffuse_Physical( irradiance, geometry, material, &reflectedLight );
  // #endif
  // #if defined( RE_IndirectSpecular )
    RE_IndirectSpecular_Physical( radiance, iblIrradiance, clearcoatRadiance, geometry, material, &reflectedLight );
  // #endif

  var totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  var totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  var outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
  return vec4<f32>( outgoingLight.xyz, 1.0);
}
`;

/***/ }),

/***/ "./src/ts/core/pipelines/debug-pipeline/DebugPipelineVS.ts":
/*!*****************************************************************!*\
  !*** ./src/ts/core/pipelines/debug-pipeline/DebugPipelineVS.ts ***!
  \*****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "vertexShader": () => (/* binding */ vertexShader)
/* harmony export */ });
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");


// prettier-ignore
const vertexShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__.shader`
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Transform).template.vertexBlock}

struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vFragUV : vec2<f32>,
    @location(1) vNormal : vec3<f32>,
    @location(2) vViewPosition : vec3<f32>
};

@stage(vertex)
fn main(@location(0) pos: vec4<f32>, @location(1) norm: vec3<f32>, @location(2) uv: vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    mvPosition = uniforms.modelViewMatrix * mvPosition;

    output.vViewPosition = - mvPosition.xyz;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv * vec2<f32>(${e => e.defines.uvScaleX || '1.0'}, ${e => e.defines.uvScaleY || '1.0'});

    var transformedNormal = uniforms.normalMatrix * norm.xyz;
    output.vNormal = normalize( transformedNormal );

    return output;
}
`;

/***/ }),

/***/ "./src/ts/core/pipelines/resources/LightingResource.ts":
/*!*************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/LightingResource.ts ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "LightingResource": () => (/* binding */ LightingResource)
/* harmony export */ });
/* harmony import */ var _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MemoryUtils */ "./src/ts/core/pipelines/resources/MemoryUtils.ts");
/* harmony import */ var _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./PipelineResourceTemplate */ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }





class LightingResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__.PipelineResourceTemplate {
  constructor() {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_2__.GroupType.Material, _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__.ResourceType.Lighting);
  }

  build(manager, pipeline, curBindIndex) {
    this.lightingConfigBinding = curBindIndex;
    this.sceneLightingBinding = curBindIndex + 1;
    this.directionLightBinding = pipeline.defines.NUM_DIR_LIGHTS ? curBindIndex + 2 : -1;
    const group = pipeline.groupIndex(this.groupType);

    if (!LightingResource.lightingConfig) {
      const LIGHTING_CONFIG_SIZE = _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP.u32;
      const SCENE_LIGHTING_BUFFER = _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["vec4<f32>"];
      LightingResource.lightingConfig = manager.device.createBuffer({
        label: "lightingConfigUniform",
        size: LIGHTING_CONFIG_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
      LightingResource.sceneLightingBuffer = manager.device.createBuffer({
        label: "sceneLightingBuffer",
        size: SCENE_LIGHTING_BUFFER,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      }); // Defaults for lighting info
      // prettier-ignore

      const lightInofoDefaults = new Uint32Array([0 // Num Directional lights
      ]); // Defaults for scene lights buffer
      // prettier-ignore

      const sceneLightingBufferDefaults = new Float32Array([0.0, 0.0, 0.0, 0 // Ambient Light Color
      ]); // Set defaults

      new Float32Array(LightingResource.lightingConfig.getMappedRange()).set(lightInofoDefaults);
      LightingResource.lightingConfig.unmap();
      new Float32Array(LightingResource.sceneLightingBuffer.getMappedRange()).set(sceneLightingBufferDefaults);
      LightingResource.sceneLightingBuffer.unmap();
    }

    if (LightingResource.rebuildDirectionLights && LightingResource.numDirLights > 0) {
      LightingResource.rebuildDirectionLights = false;
      if (LightingResource.directionLightsBuffer) LightingResource.directionLightsBuffer.destroy();
      LightingResource.directionLightsBuffer = manager.device.createBuffer({
        label: "dirLightsBuffer",
        size: _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["vec4<f32>"] * 2 * LightingResource.numDirLights,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
    } // prettier-ignore


    return {
      group,
      bindings: [{
        buffer: LightingResource.lightingConfig
      }, {
        buffer: LightingResource.sceneLightingBuffer
      }].concat(LightingResource.numDirLights ? {
        buffer: LightingResource.directionLightsBuffer
      } : []),
      fragmentBlock: `struct SceneLightingUniform {
        ambientLightColor: vec4<f32>
      };

      struct LightingConfigUniform {
        numDirectionalLights: u32
      };

      @group(${group}) @binding(${this.lightingConfigBinding})
      var<uniform> lightingConfigUniform: LightingConfigUniform;

      @group(${group}) @binding(${this.sceneLightingBinding})
      var<uniform> sceneLightingUniform: SceneLightingUniform;


      ${pipeline.defines.NUM_DIR_LIGHTS ? `
      struct DirectionLightUniform {
        direction : vec4<f32>,
        color : vec4<f32>
      };

      struct DirectionLightsUniform {
        directionalLights: array<DirectionLightUniform>
      };

      @group(${group}) @binding(${this.directionLightBinding})
      var<storage, read> directionLightsUniform: DirectionLightsUniform;
      ` : ''}
      `,
      vertexBlock: null
    };
  }

  getBindingData(manager, pipeline) {
    return {
      binds: [{
        binding: this.lightingConfigBinding,
        resource: {
          buffer: LightingResource.lightingConfig
        }
      }, {
        binding: this.sceneLightingBinding,
        resource: {
          buffer: LightingResource.sceneLightingBuffer
        }
      }].concat(LightingResource.numDirLights ? {
        binding: this.directionLightBinding,
        resource: {
          buffer: LightingResource.directionLightsBuffer
        }
      } : []),
      buffer: null
    };
  }

}

_defineProperty(LightingResource, "numDirLights", 0);

_defineProperty(LightingResource, "rebuildDirectionLights", true);

/***/ }),

/***/ "./src/ts/core/pipelines/resources/MaterialResource.ts":
/*!*************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/MaterialResource.ts ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "MaterialResource": () => (/* binding */ MaterialResource)
/* harmony export */ });
/* harmony import */ var _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./PipelineResourceTemplate */ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");



class MaterialResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceTemplate {
  constructor() {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Material, _common_ResourceType__WEBPACK_IMPORTED_MODULE_2__.ResourceType.Material);
  }

  build(manager, pipeline, curBindIndex) {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType); // prettier-ignore

    const initialValues = new Float32Array([1, 1, 1, 0, // Diffuse
    0.0, 0.0, 0.0, 0, // Emissive
    1, // Alpha
    0, // Metalness
    0.5 // Roughness
    ]);
    const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;
    const buffer = manager.device.createBuffer({
      label: "materialData",
      size: SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    }); // Set defaults

    new Float32Array(buffer.getMappedRange()).set(initialValues);
    buffer.unmap();
    const resource = {
      buffer: buffer,
      offset: 0,
      size: SIZE
    };
    return {
      group,
      bindings: [resource],
      // prettier-ignore
      fragmentBlock: `
      struct MaterialData {
        diffuse: vec4<f32>,
        emissive: vec4<f32>,
        opacity: f32,
        metalness: f32,
        roughness: f32
      };

      @group(${group}) @binding(${curBindIndex})
      var<uniform> materialData: MaterialData;
      `,
      vertexBlock: null
    };
  }

  getBindingData(manager, pipeline) {
    // prettier-ignore
    const initialValues = new Float32Array([1, 1, 1, 0, // Diffuse
    0.0, 0.0, 0.0, 0, // Emissive
    1, // Alpha
    0, // Metalness
    0.5 // Roughness
    ]);
    const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;
    const buffer = manager.device.createBuffer({
      label: "materialData",
      size: SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    }); // Set defaults

    new Float32Array(buffer.getMappedRange()).set(initialValues);
    buffer.unmap();
    const resource = {
      buffer: buffer,
      offset: 0,
      size: SIZE
    };
    return {
      binds: [{
        binding: this.binding,
        resource
      }],
      buffer
    };
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/resources/MemoryUtils.ts":
/*!********************************************************!*\
  !*** ./src/ts/core/pipelines/resources/MemoryUtils.ts ***!
  \********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "UNIFORM_TYPES_MAP": () => (/* binding */ UNIFORM_TYPES_MAP)
/* harmony export */ });
const UNIFORM_TYPES_MAP = {
  "mat4x4<f32>": 16 * Float32Array.BYTES_PER_ELEMENT,
  "mat3x3<f32>": 12 * Float32Array.BYTES_PER_ELEMENT,
  "vec4<f32>": 4 * Float32Array.BYTES_PER_ELEMENT,
  "vec3<f32>": 3 * Float32Array.BYTES_PER_ELEMENT,
  "vec2<f32>": 2 * Float32Array.BYTES_PER_ELEMENT,
  f32: 1 * Float32Array.BYTES_PER_ELEMENT,
  i32: 1 * Int32Array.BYTES_PER_ELEMENT,
  u32: 1 * Uint32Array.BYTES_PER_ELEMENT,
  i16: 1 * Int16Array.BYTES_PER_ELEMENT,
  u16: 1 * Uint16Array.BYTES_PER_ELEMENT
};

/***/ }),

/***/ "./src/ts/core/pipelines/resources/PipelineResourceInstance.ts":
/*!*********************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/PipelineResourceInstance.ts ***!
  \*********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PipelineResourceInstance": () => (/* binding */ PipelineResourceInstance)
/* harmony export */ });
class PipelineResourceInstance {
  constructor(group, bindGroup) {
    let buffer = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    this.group = group;
    this.bindGroup = bindGroup;
    this.buffers = buffer;
  }

  dispose() {
    if (this.buffers) this.buffers.forEach(b => b.destroy());
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts":
/*!*********************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts ***!
  \*********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PipelineResourceTemplate": () => (/* binding */ PipelineResourceTemplate)
/* harmony export */ });
class PipelineResourceTemplate {
  constructor(groupType, groupSubType, id) {
    this.groupType = groupType;
    this.resourceType = groupSubType;
    this.id = id;
  }
  /** Creates the resource. Must return a group index*/


}

/***/ }),

/***/ "./src/ts/core/pipelines/resources/TextureResource.ts":
/*!************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/TextureResource.ts ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "TextureResource": () => (/* binding */ TextureResource)
/* harmony export */ });
/* harmony import */ var _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./PipelineResourceTemplate */ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");
/* harmony import */ var _textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../textures/BitmapCubeTexture */ "./src/ts/core/textures/BitmapCubeTexture.ts");




class TextureResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceTemplate {
  constructor(texture, id) {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Material, _common_ResourceType__WEBPACK_IMPORTED_MODULE_2__.ResourceType.Texture, id);
    this.texture = texture;
  }

  build(manager, pipeline, curBindIndex) {
    this.samplerBind = curBindIndex;
    this.textureBind = curBindIndex + 1;
    const group = pipeline.groupIndex(this.groupType);
    const isCube = this.texture instanceof _textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_3__.BitmapCubeTexture; // prettier-ignore

    return {
      group,
      bindings: [this.texture.sampler.gpuSampler, this.texture.gpuTexture.createView()],
      fragmentBlock: `
      ${pipeline.defines.diffuseMap && `
      @group(${group}) @binding(${this.samplerBind})
      var ${this.id}Sampler: sampler;
      @group(${group}) @binding(${this.textureBind})
      var ${this.id}Texture: ${isCube ? 'texture_cube' : 'texture_2d'}<f32>;`}`,
      vertexBlock: null
    };
  }

  getBindingData(manager, pipeline) {
    const isCube = this.texture instanceof _textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_3__.BitmapCubeTexture;
    const cubeTexture = this.texture;
    return {
      binds: [{
        binding: this.samplerBind,
        resource: this.texture.sampler.gpuSampler
      }, {
        binding: this.textureBind,
        resource: this.texture.gpuTexture.createView({
          dimension: isCube ? "cube" : "2d",
          aspect: "all",
          label: isCube ? "Cube View Form" : "2D View Format",
          arrayLayerCount: isCube ? cubeTexture.src.length : undefined,
          baseArrayLayer: isCube ? 0 : undefined,
          baseMipLevel: 0
        })
      }],
      buffer: null
    };
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/resources/TransformResource.ts":
/*!**************************************************************!*\
  !*** ./src/ts/core/pipelines/resources/TransformResource.ts ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "TransformResource": () => (/* binding */ TransformResource),
/* harmony export */   "TransformType": () => (/* binding */ TransformType)
/* harmony export */ });
/* harmony import */ var _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MemoryUtils */ "./src/ts/core/pipelines/resources/MemoryUtils.ts");
/* harmony import */ var _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./PipelineResourceTemplate */ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");




let TransformType;

(function (TransformType) {
  TransformType[TransformType["Projection"] = 1] = "Projection";
  TransformType[TransformType["ModelView"] = 2] = "ModelView";
  TransformType[TransformType["Model"] = 4] = "Model";
  TransformType[TransformType["Normal"] = 8] = "Normal";
})(TransformType || (TransformType = {}));

class TransformResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__.PipelineResourceTemplate {
  constructor(transformType) {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_2__.GroupType.Transform, _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__.ResourceType.Transform);
    this.transformType = transformType;
    this.projectionOffset = -1;
    this.modelViewOffset = -1;
    this.modelOffset = -1;
    this.normalOffset = -1;
  }

  getBufferSize() {
    const requiresProjection = this.transformType & TransformType.Projection;
    const requiresModelView = this.transformType & TransformType.ModelView;
    const requiresModel = this.transformType & TransformType.Model;
    const requiresNormal = this.transformType & TransformType.Normal; // prettier-ignore

    return (requiresProjection ? _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + (requiresModelView ? _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + (requiresModel ? _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + (requiresNormal ? _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat3x3<f32>"] : 0);
  }

  build(manager, pipeline, curBindIndex) {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);
    const requiresProjection = this.transformType & TransformType.Projection;
    const requiresModelView = this.transformType & TransformType.ModelView;
    const requiresModel = this.transformType & TransformType.Model;
    const requiresNormal = this.transformType & TransformType.Normal;
    this.projectionOffset = -1;
    this.modelViewOffset = -1;
    this.modelOffset = -1;
    this.normalOffset = -1;
    let curOffset = 0;

    if (requiresProjection) {
      this.projectionOffset = curOffset;
      curOffset += _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }

    if (requiresModelView) {
      this.modelViewOffset = curOffset;
      curOffset += _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }

    if (requiresModel) {
      this.modelOffset = curOffset;
      curOffset += _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }

    if (requiresNormal) {
      this.normalOffset = curOffset;
      curOffset += _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat3x3<f32>"];
    }

    const SIZEOF_MATRICES = this.getBufferSize();
    const buffer = manager.device.createBuffer({
      label: "transform",
      size: SIZEOF_MATRICES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    return {
      group,
      bindings: [{
        buffer
      }],
      fragmentBlock: null,
      // prettier-ignore
      vertexBlock: `
      struct TransformUniform {
        ${requiresProjection ? 'projMatrix: mat4x4<f32>,' : ''}
        ${requiresModelView ? 'modelViewMatrix: mat4x4<f32>,' : ''}
        ${requiresModel ? 'modelMatrix: mat4x4<f32>,' : ''}
        ${requiresNormal ? 'normalMatrix: mat3x3<f32>' : ''}
      };
      @group(${group}) @binding(${curBindIndex})
      var<uniform> uniforms: TransformUniform;
      `
    };
  }

  getBindingData(manager, pipeline) {
    const SIZEOF_MATRICES = this.getBufferSize();
    const buffer = manager.device.createBuffer({
      label: "transform",
      size: SIZEOF_MATRICES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    return {
      binds: [{
        binding: this.binding,
        resource: {
          buffer: buffer,
          offset: 0,
          size: SIZEOF_MATRICES
        }
      }],
      buffer
    };
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/shader-lib/MathFunctions.ts":
/*!***********************************************************!*\
  !*** ./src/ts/core/pipelines/shader-lib/MathFunctions.ts ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "mathConstants": () => (/* binding */ mathConstants),
/* harmony export */   "mathFunctions": () => (/* binding */ mathFunctions)
/* harmony export */ });
const mathConstants =
/* wgsl */
`
let PI: f32 = 3.141592653589793;
let PI2: f32 = 6.283185307179586;
let PI_HALF: f32 = 1.5707963267948966;
let RECIPROCAL_PI: f32 = 0.3183098861837907;
let RECIPROCAL_PI2: f32 = 0.15915494309189535;
let EPSILON: f32 = 0.000001;
`;
const mathFunctions =
/* wgsl */
`
fn saturate( a: f32 ) -> f32 {
    return clamp( a, 0.0, 1.0 );
}

fn whiteComplement( a: f32 ) -> f32 {
    return ( 1.0 - saturate( a ) );
}

fn pow2( x: f32 ) -> f32 {
    return x*x;
}

fn pow3( x: f32 ) -> f32 {
    return x*x*x;
}

fn pow4( x: f32 ) -> f32 {
    var x2 = x*x;
    return x2*x2;
}

fn max3( v: vec3<f32> ) -> f32 {
    return max( max( v.x, v.y ), v.z );
}

fn average( color: vec3<f32> )-> f32 {
    return dot( color, vec3( 0.3333 ) );
}

fn rand( uv: vec2<f32> ) -> f32 {
    var a: f32 = 12.9898;
    var b: f32 = 78.233;
    var c: f32 = 43758.5453;
    var dt = dot( uv.xy, vec2<f32>( a, b ) );
    var sn = dt % PI;
    return fract( sin( sn ) * c );
}

fn precisionSafeLength( v: vec3<f32> )-> f32 {
    return length( v );
}`;

/***/ }),

/***/ "./src/ts/core/pipelines/shader-lib/Utils.ts":
/*!***************************************************!*\
  !*** ./src/ts/core/pipelines/shader-lib/Utils.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "shader": () => (/* binding */ shader),
/* harmony export */   "shaderBuilder": () => (/* binding */ shaderBuilder)
/* harmony export */ });
function shader(strings) {
  for (var _len = arguments.length, expr = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    expr[_key - 1] = arguments[_key];
  }

  return {
    strings,
    expressions: expr
  };
}
function shaderBuilder(sourceFragments, pipeline) {
  let str = "";
  sourceFragments.strings.forEach((string, i) => {
    if (typeof sourceFragments.expressions[i] === "string" || typeof sourceFragments.expressions[i] === "number") str += string + (sourceFragments.expressions[i] || "");else if (sourceFragments.expressions[i]) {
      const fnOrText = sourceFragments.expressions[i];

      if (typeof fnOrText === "string") {
        str += string + fnOrText;
      } else {
        const expressionReturn = fnOrText(pipeline);

        if (typeof expressionReturn === "string") {
          str += string + expressionReturn;
        } else if (typeof expressionReturn === "number") {
          str += string + expressionReturn.toString();
        } else {
          str += string;
        }
      }
    } else {
      str += string;
    }
  });
  return str;
}

/***/ }),

/***/ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipeline.ts":
/*!*****************************************************************!*\
  !*** ./src/ts/core/pipelines/skybox-pipeline/SkyboxPipeline.ts ***!
  \*****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "SkyboxPipeline": () => (/* binding */ SkyboxPipeline)
/* harmony export */ });
/* harmony import */ var _Pipeline__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../Pipeline */ "./src/ts/core/pipelines/Pipeline.ts");
/* harmony import */ var _resources_TextureResource__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../resources/TextureResource */ "./src/ts/core/pipelines/resources/TextureResource.ts");
/* harmony import */ var _resources_TransformResource__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../resources/TransformResource */ "./src/ts/core/pipelines/resources/TransformResource.ts");
/* harmony import */ var _VertexAttribute__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../VertexAttribute */ "./src/ts/core/pipelines/VertexAttribute.ts");
/* harmony import */ var _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../VertexBufferLayout */ "./src/ts/core/pipelines/VertexBufferLayout.ts");
/* harmony import */ var _SkyboxPipelineFS__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./SkyboxPipelineFS */ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineFS.ts");
/* harmony import */ var _SkyboxPipelineVS__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./SkyboxPipelineVS */ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineVS.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../../../common/AttributeType */ "./src/common/AttributeType.ts");








class SkyboxPipeline extends _Pipeline__WEBPACK_IMPORTED_MODULE_0__.Pipeline {
  constructor(name, defines) {
    super(name, _SkyboxPipelineVS__WEBPACK_IMPORTED_MODULE_6__.vertexShader, _SkyboxPipelineFS__WEBPACK_IMPORTED_MODULE_5__.fragmentShader, defines);
    this.frontFace = "cw";
    this.depthCompare = "less";
    this.depthWriteEnabled = false;
    this.vertexLayouts = [new _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_4__.VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [new _VertexAttribute__WEBPACK_IMPORTED_MODULE_3__.VertexAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_7__.AttributeType.POSITION, 0, "float32x3", 0)]), new _VertexBufferLayout__WEBPACK_IMPORTED_MODULE_4__.VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 2, [new _VertexAttribute__WEBPACK_IMPORTED_MODULE_3__.VertexAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_7__.AttributeType.UV, 1, "float32x2", 0)])];
  }

  onAddResources() {
    const transformResource = new _resources_TransformResource__WEBPACK_IMPORTED_MODULE_2__.TransformResource(_resources_TransformResource__WEBPACK_IMPORTED_MODULE_2__.TransformType.Projection | _resources_TransformResource__WEBPACK_IMPORTED_MODULE_2__.TransformType.ModelView | _resources_TransformResource__WEBPACK_IMPORTED_MODULE_2__.TransformType.Model);
    this.addTemplate(transformResource);

    if (this.defines.diffuseMap) {
      const resource = new _resources_TextureResource__WEBPACK_IMPORTED_MODULE_1__.TextureResource(this.defines.diffuseMap, "diffuse");
      this.addTemplate(resource);
    }
  }

}

/***/ }),

/***/ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineFS.ts":
/*!*******************************************************************!*\
  !*** ./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineFS.ts ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "fragmentShader": () => (/* binding */ fragmentShader)
/* harmony export */ });
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");


// prettier-ignore
const fragmentShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__.shader`
${e => e.defines.diffuseMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Texture, 'diffuse').template.fragmentBlock : ''}

@stage(fragment)
fn main(
  @location(0) vFragUV: vec2<f32>,
  @location(1) vViewPosition : vec3<f32>,
  @location(2) vWorldDirection : vec3<f32>
) -> @location(0) vec4<f32> {

  var diffuseColor = vec4<f32>( 1.0, 1.0, 1.0, 1.0 );
  var vReflect = vWorldDirection;

  ${e => e.defines.diffuseMap && `var texelColor = textureSample(diffuseTexture, diffuseSampler, vec3<f32>( vReflect.x, vReflect.yz ));
  diffuseColor = diffuseColor * texelColor;`}

  return vec4<f32>( diffuseColor.xyz, 1.0);
}
`;

/***/ }),

/***/ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineVS.ts":
/*!*******************************************************************!*\
  !*** ./src/ts/core/pipelines/skybox-pipeline/SkyboxPipelineVS.ts ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "vertexShader": () => (/* binding */ vertexShader)
/* harmony export */ });
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");


// prettier-ignore
const vertexShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_0__.shader`
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Transform).template.vertexBlock}

struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vFragUV : vec2<f32>,
    @location(1) vViewPosition : vec3<f32>,
    @location(2) vWorldDirection : vec3<f32>
};

fn transformDirection( dir: vec3<f32>, matrix: mat4x4<f32> ) -> vec3<f32> {
  return normalize( ( matrix * vec4<f32>( dir, 0.0 ) ).xyz );
}

@stage(vertex)
fn main(@location(0) pos: vec4<f32>, @location(1) uv: vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    output.vWorldDirection = transformDirection( pos.xyz, uniforms.modelMatrix );

    mvPosition = uniforms.modelViewMatrix * mvPosition;

    output.vViewPosition = - mvPosition.xyz;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv;

    return output;
}
`;

/***/ }),

/***/ "./src/ts/core/textures/BitmapCubeTexture.ts":
/*!***************************************************!*\
  !*** ./src/ts/core/textures/BitmapCubeTexture.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "BitmapCubeTexture": () => (/* binding */ BitmapCubeTexture)
/* harmony export */ });
/* harmony import */ var _ImageLoader__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ImageLoader */ "./src/ts/core/textures/ImageLoader.ts");
/* harmony import */ var _Texture__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Texture */ "./src/ts/core/textures/Texture.ts");


class BitmapCubeTexture extends _Texture__WEBPACK_IMPORTED_MODULE_1__.Texture {
  constructor(name, src, device, sampler) {
    super(name, device, sampler);
    this.src = src;
  }

  async load(device) {
    let gpuTexture;
    const loader = await new _ImageLoader__WEBPACK_IMPORTED_MODULE_0__.ImageLoader().loadImages(this.src);
    gpuTexture = device.createTexture({
      size: {
        width: loader.maxWidth,
        height: loader.maxHeight,
        depthOrArrayLayers: this.src.length
      },
      format: "rgba8unorm",
      dimension: "2d",
      mipLevelCount: 1,
      // TODO: why doesnt this work? this.getNumMipmaps(loader.maxWidth, loader.maxHeight),
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    for (let i = 0; i < this.src.length; i++) device.queue.copyExternalImageToTexture({
      source: loader.images[i]
    }, {
      texture: gpuTexture,
      origin: {
        x: 0,
        y: 0,
        z: i
      }
    }, {
      width: loader.maxWidth,
      height: loader.maxHeight
    });

    this.gpuTexture = gpuTexture;
    return this;
  }

}

/***/ }),

/***/ "./src/ts/core/textures/BitmapTexture.ts":
/*!***********************************************!*\
  !*** ./src/ts/core/textures/BitmapTexture.ts ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "BitmapTexture": () => (/* binding */ BitmapTexture)
/* harmony export */ });
/* harmony import */ var _ImageLoader__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ImageLoader */ "./src/ts/core/textures/ImageLoader.ts");
/* harmony import */ var _Texture__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Texture */ "./src/ts/core/textures/Texture.ts");


class BitmapTexture extends _Texture__WEBPACK_IMPORTED_MODULE_1__.Texture {
  constructor(name, src, device, sampler) {
    super(name, device, sampler);
    this.src = src;
  }

  async load(device) {
    let gpuTexture;
    const loader = await new _ImageLoader__WEBPACK_IMPORTED_MODULE_0__.ImageLoader().loadImages([this.src]);
    gpuTexture = device.createTexture({
      size: {
        width: loader.maxWidth,
        height: loader.maxHeight,
        depthOrArrayLayers: 1
      },
      format: "rgba8unorm",
      dimension: "2d",
      mipLevelCount: 1,
      // TODO: why doesnt this work? this.getNumMipmaps(loader.maxWidth, loader.maxHeight),
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture({
      source: loader.images[0]
    }, {
      texture: gpuTexture
    }, [loader.maxWidth, loader.maxHeight]);
    this.gpuTexture = gpuTexture;
    return this;
  }

}

/***/ }),

/***/ "./src/ts/core/textures/ImageLoader.ts":
/*!*********************************************!*\
  !*** ./src/ts/core/textures/ImageLoader.ts ***!
  \*********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ImageLoader": () => (/* binding */ ImageLoader)
/* harmony export */ });
class ImageLoader {
  constructor() {}

  async loadImages(paths) {
    const promises = paths.map(src => {
      return new Promise(function (resolve, reject) {
        const img = document.createElement("img");
        img.crossOrigin = "Anonymous";
        img.src = src;
        img.decode().then(result => {
          return createImageBitmap(img);
        }).then(data => {
          resolve(data);
        }).catch(err => reject(err));
      });
    });
    const images = await Promise.all(promises);
    const {
      maxHeight,
      maxWidth
    } = images.reduce((prev, cur) => {
      prev.maxHeight = Math.max(cur.height, prev.maxHeight);
      prev.maxWidth = Math.max(cur.width, prev.maxWidth);
      return prev;
    }, {
      maxHeight: 0,
      maxWidth: 0
    });
    this.maxHeight = maxHeight;
    this.maxWidth = maxWidth;
    this.images = images;
    return this;
  }

}

/***/ }),

/***/ "./src/ts/core/textures/Sampler.ts":
/*!*****************************************!*\
  !*** ./src/ts/core/textures/Sampler.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Sampler": () => (/* binding */ Sampler)
/* harmony export */ });
const TABLE = new Map();
class Sampler {
  constructor(device) {
    let option = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    option = {
      magFilter: option.magFilter || "linear",
      minFilter: option.minFilter || "linear",
      mipmapFilter: option.mipmapFilter || "linear",
      addressModeU: option.addressModeU || "repeat",
      addressModeV: option.addressModeV || "repeat",
      addressModeW: option.addressModeW || "repeat"
    };
    this.id = JSON.stringify(option);
    if (TABLE.has(this.id)) return TABLE.get(this.id);else this.gpuSampler = device.createSampler(option);
    TABLE.set(this.id, this);
  }

}

/***/ }),

/***/ "./src/ts/core/textures/Texture.ts":
/*!*****************************************!*\
  !*** ./src/ts/core/textures/Texture.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Texture": () => (/* binding */ Texture)
/* harmony export */ });
/* harmony import */ var _Sampler__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Sampler */ "./src/ts/core/textures/Sampler.ts");

let defaultSampler;
class Texture {
  constructor(name, device, sampler) {
    this.name = name;
    this.generateMipmaps = true;
    if (!defaultSampler) defaultSampler = new _Sampler__WEBPACK_IMPORTED_MODULE_0__.Sampler(device);
    this.sampler = sampler || defaultSampler;
  }

  getNumMipmaps(w, h) {
    if (this.generateMipmaps) {
      const mipMaps = Math.round(Math.log2(Math.max(w, h)));
      if (mipMaps > 10) return 11;
      return mipMaps + 1;
    }

    return 1;
  }

}

/***/ }),

/***/ "./src/ts/gameplay/Player.ts":
/*!***********************************!*\
  !*** ./src/ts/gameplay/Player.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Player": () => (/* binding */ Player)
/* harmony export */ });
/* harmony import */ var _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/WasmManager */ "./src/ts/core/WasmManager.ts");

class Player {
  constructor() {
    this.transformPtr = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createTransformNode("player");
    this.playerPtr = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createPlayerComponent();
    this.propertiesView = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.getInt32Array(_core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.getPlayerComponentProperties(this.playerPtr));
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.addComponent(this.transformPtr, this.playerPtr);
  }

  get health() {
    return this.propertiesView[0];
  }

  get hunger() {
    return this.propertiesView[2];
  }

}

/***/ }),

/***/ "./src/ts/renderer/Mesh.ts":
/*!*********************************!*\
  !*** ./src/ts/renderer/Mesh.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Mesh": () => (/* binding */ Mesh)
/* harmony export */ });
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../core/WasmManager */ "./src/ts/core/WasmManager.ts");
/* harmony import */ var _Object3D__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Object3D */ "./src/ts/renderer/Object3D.ts");
/* harmony import */ var _PipelineManager__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./PipelineManager */ "./src/ts/renderer/PipelineManager.ts");




class Mesh extends _Object3D__WEBPACK_IMPORTED_MODULE_2__.Object3D {
  constructor(geometry, pipeline, manager, name) {
    super(name);
    this.renderIndex = -1;
    this.geometry = geometry;
    this.pipeline = pipeline;
    this.meshComponent = -1;
    this.slotMap = new Map();
    const pipelineIndex = _PipelineManager__WEBPACK_IMPORTED_MODULE_3__.pipelineManager.pipelines.indexOf(this.pipeline);
    const pipelineInsPtr = _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.createMeshPipelineInstance(this.pipeline.name, pipelineIndex);
    this.meshComponent = _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.createMeshComponent(this.geometry.bufferGeometry, pipelineInsPtr, this.name);
    this.pipeline.vertexLayouts.map(buffer => buffer.attributes.map(attr => {
      _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.addPipelineAttribute(pipelineInsPtr, attr.attributeType, attr.shaderLocation);
      this.slotMap.set(attr.attributeType, attr.shaderLocation);
    })); // Assign a transform buffer to the intance

    this.transformIndex = this.pipeline.addResourceInstance(manager, _common_GroupType__WEBPACK_IMPORTED_MODULE_0__.GroupType.Transform);
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.setMeshPipelineTransformIndex(pipelineInsPtr, this.transformIndex);
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.addComponent(this.transform, this.meshComponent);
    this.modelViewMatrix = _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getFloat32Array(_core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getTransformModelViewMatrix(this.transform));
    this.normalMatrix = _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getFloat32Array(_core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getTransformNormalMatrix(this.transform));
    this.worldMatrix = _core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getFloat32Array(_core_WasmManager__WEBPACK_IMPORTED_MODULE_1__.wasm.getTransformWorldMatrix(this.transform));
  }

}

/***/ }),

/***/ "./src/ts/renderer/MeshManager.ts":
/*!****************************************!*\
  !*** ./src/ts/renderer/MeshManager.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "meshManager": () => (/* binding */ meshManager)
/* harmony export */ });
class MeshManager {
  constructor() {
    this.meshes = new Map();
  }

  addMesh(mesh) {
    const meshes = this.meshes; // @ts-expect-error

    const meshPtr = mesh.meshComponent | 0;

    if (!meshes.has(meshPtr)) {
      meshes.set(meshPtr, mesh);
    }

    return mesh;
  }

  removeMesh(mesh) {
    const meshes = this.meshes; // @ts-expect-error

    const meshPtr = mesh.meshComponent | 0;

    if (meshes.has(meshPtr)) {
      meshes.delete(meshPtr);
    }

    return mesh;
  }

}

const meshManager = new MeshManager();

/***/ }),

/***/ "./src/ts/renderer/Object3D.ts":
/*!*************************************!*\
  !*** ./src/ts/renderer/Object3D.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Object3D": () => (/* binding */ Object3D)
/* harmony export */ });
/* harmony import */ var _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/WasmManager */ "./src/ts/core/WasmManager.ts");
/* harmony import */ var _common_math_MathUtils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../common/math/MathUtils */ "./src/common/math/MathUtils.ts");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }



let objectId = 1;
class Object3D {
  constructor(name) {
    _defineProperty(this, "uuid", (0,_common_math_MathUtils__WEBPACK_IMPORTED_MODULE_1__.generateUUID)());

    this.transform = 0;
    this.name = name || "";
    this.id = objectId++;
    this.transform = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createTransformNode(this.name);
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.setId(this.transform, this.id);
  }

  set visibility(val) {
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.setVisibility(this.transform, val);
  }

  get visibility() {
    return _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.getVisibility(this.transform);
  }

  add(child) {
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.addChild(this.transform, child.transform);
  }

  remove(child) {
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.removeChild(this.transform, child.transform);
  }

}

/***/ }),

/***/ "./src/ts/renderer/PipelineManager.ts":
/*!********************************************!*\
  !*** ./src/ts/renderer/PipelineManager.ts ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "pipelineManager": () => (/* binding */ pipelineManager)
/* harmony export */ });
/* harmony import */ var _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/pipelines/debug-pipeline/DebugPipeline */ "./src/ts/core/pipelines/debug-pipeline/DebugPipeline.ts");
/* harmony import */ var _core_pipelines_skybox_pipeline_SkyboxPipeline__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../core/pipelines/skybox-pipeline/SkyboxPipeline */ "./src/ts/core/pipelines/skybox-pipeline/SkyboxPipeline.ts");
/* harmony import */ var _TextureManager__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./TextureManager */ "./src/ts/renderer/TextureManager.ts");




class PipelineManager {
  getPipeline(name) {
    return this.pipelines.find(p => p.name === name);
  }

  init(gameManager) {
    this.pipelines = [new _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__.DebugPipeline("coastal-floor", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("ground-coastal-1"),
      NUM_DIR_LIGHTS: 0,
      uvScaleX: "30.0",
      uvScaleY: "30.0"
    }), new _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__.DebugPipeline("crate", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("crate"),
      NUM_DIR_LIGHTS: 0
    }), new _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__.DebugPipeline("simple", {
      NUM_DIR_LIGHTS: 0
    }), new _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__.DebugPipeline("earth", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("earth"),
      NUM_DIR_LIGHTS: 0
    }), new _core_pipelines_debug_pipeline_DebugPipeline__WEBPACK_IMPORTED_MODULE_0__.DebugPipeline("concrete", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("block-concrete-4"),
      NUM_DIR_LIGHTS: 0
    }), new _core_pipelines_skybox_pipeline_SkyboxPipeline__WEBPACK_IMPORTED_MODULE_1__.SkyboxPipeline("skybox", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("desert-sky")
    }), new _core_pipelines_skybox_pipeline_SkyboxPipeline__WEBPACK_IMPORTED_MODULE_1__.SkyboxPipeline("stars", {
      diffuseMap: _TextureManager__WEBPACK_IMPORTED_MODULE_2__.textureManager.find("starry-sky")
    })];
    this.pipelines.forEach(p => {
      p.build(gameManager);
      p.initialize(gameManager);
    });
  }

}

const pipelineManager = new PipelineManager();

/***/ }),

/***/ "./src/ts/renderer/TextureManager.ts":
/*!*******************************************!*\
  !*** ./src/ts/renderer/TextureManager.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "textureManager": () => (/* binding */ textureManager)
/* harmony export */ });
/* harmony import */ var _core_textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/textures/BitmapCubeTexture */ "./src/ts/core/textures/BitmapCubeTexture.ts");
/* harmony import */ var _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../core/textures/BitmapTexture */ "./src/ts/core/textures/BitmapTexture.ts");


const MEDIA_URL = "https://storage.googleapis.com/rewild-6809/";

class TextureManager {
  async init(device) {
    // TEXTURES
    const textures = [new _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__.BitmapTexture("grid", MEDIA_URL + "uv-grid.jpg", device), new _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__.BitmapTexture("crate", MEDIA_URL + "crate-wooden.jpg", device), new _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__.BitmapTexture("earth", MEDIA_URL + "earth-day-2k.jpg", device), new _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__.BitmapTexture("ground-coastal-1", MEDIA_URL + "nature/dirt/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png", device), new _core_textures_BitmapTexture__WEBPACK_IMPORTED_MODULE_1__.BitmapTexture("block-concrete-4", MEDIA_URL + "construction/walls/TexturesCom_Wall_BlockConcrete4_2x2_B_1K_albedo.png", device), new _core_textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_0__.BitmapCubeTexture("desert-sky", [MEDIA_URL + "skyboxes/desert/px.jpg", MEDIA_URL + "skyboxes/desert/nx.jpg", MEDIA_URL + "skyboxes/desert/py.jpg", MEDIA_URL + "skyboxes/desert/ny.jpg", MEDIA_URL + "skyboxes/desert/pz.jpg", MEDIA_URL + "skyboxes/desert/nz.jpg"], device), new _core_textures_BitmapCubeTexture__WEBPACK_IMPORTED_MODULE_0__.BitmapCubeTexture("starry-sky", [MEDIA_URL + "skyboxes/stars/left.png", MEDIA_URL + "skyboxes/stars/right.png", MEDIA_URL + "skyboxes/stars/top.png", MEDIA_URL + "skyboxes/stars/bottom.png", MEDIA_URL + "skyboxes/stars/front.png", MEDIA_URL + "skyboxes/stars/back.png"], device)];
    this.textures = await Promise.all(textures.map(texture => {
      return texture.load(device);
    }));
  }

  find(name) {
    return this.textures.find(texture => texture.name === name);
  }

}

const textureManager = new TextureManager();

/***/ }),

/***/ "./src/ts/renderer/geometry/BoxGeometry.ts":
/*!*************************************************!*\
  !*** ./src/ts/renderer/geometry/BoxGeometry.ts ***!
  \*************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "BoxGeometry": () => (/* binding */ BoxGeometry),
/* harmony export */   "BoxGeometryParameters": () => (/* binding */ BoxGeometryParameters)
/* harmony export */ });
/* harmony import */ var _Geometry__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Geometry */ "./src/ts/renderer/geometry/Geometry.ts");
/* harmony import */ var _common_math_Vector3__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/math/Vector3 */ "./src/common/math/Vector3.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../common/AttributeType */ "./src/common/AttributeType.ts");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }




class BoxGeometryParameters {}

class BoxGeometryBuilder {
  constructor(widthSegments, heightSegments, depthSegments) {
    _defineProperty(this, "indices", []);

    _defineProperty(this, "vertices", []);

    _defineProperty(this, "normals", []);

    _defineProperty(this, "uvs", []);

    _defineProperty(this, "numberOfVertices", 0);

    _defineProperty(this, "groupStart", 0);

    this.widthSegments = widthSegments;
    this.heightSegments = heightSegments;
    this.depthSegments = depthSegments;
  }

  buildPlane(u, v, w, udir, vdir, width, height, depth, gridX, gridY, materialIndex, box) {
    const vertices = this.vertices;
    const indices = this.indices;
    const normals = this.normals;
    const uvs = this.uvs;
    const numberOfVertices = this.numberOfVertices;
    const segmentWidth = width / gridX;
    const segmentHeight = height / gridY;
    const widthHalf = width / 2;
    const heightHalf = height / 2;
    const depthHalf = depth / 2;
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
    let vertexCounter = 0;
    let groupCount = 0;
    const vector = new _common_math_Vector3__WEBPACK_IMPORTED_MODULE_1__.Vector3(); // generate vertices, normals and uvs

    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf;

      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf; // set values to correct vector component

        vector.setByIndex(u, x * udir);
        vector.setByIndex(v, y * vdir);
        vector.setByIndex(w, depthHalf); // now apply vector to vertex buffer

        vertices.push(vector.x);
        vertices.push(vector.y);
        vertices.push(vector.z); // set values to correct vector component

        vector.setByIndex(u, 0);
        vector.setByIndex(v, 0);
        vector.setByIndex(w, depth > 0 ? 1 : -1); // now apply vector to normal buffer

        normals.push(vector.x);
        normals.push(vector.y);
        normals.push(vector.z); // uvs

        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY); // counters

        vertexCounter += 1;
      }
    } // indices
    // 1. you need three indices to draw a single face
    // 2. a single segment consists of two faces
    // 3. so we need to generate six (2*3) indices per segment


    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = numberOfVertices + ix + gridX1 * iy;
        const b = numberOfVertices + ix + gridX1 * (iy + 1);
        const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
        const d = numberOfVertices + (ix + 1) + gridX1 * iy; // faces

        indices.push(a);
        indices.push(b);
        indices.push(d);
        indices.push(b);
        indices.push(c);
        indices.push(d); // increase counter

        groupCount += 6;
      }
    } // add a group to the geometry. this will ensure multi material support


    box.addGroup(this.groupStart, groupCount, materialIndex); // calculate new start value for groups

    this.groupStart += groupCount; // update total number of vertices

    this.numberOfVertices += vertexCounter;
  }

}

class BoxGeometry extends _Geometry__WEBPACK_IMPORTED_MODULE_0__.Geometry {
  constructor() {
    let width = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
    let height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
    let depth = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
    let widthSegments = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;
    let heightSegments = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;
    let depthSegments = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 1;
    super();
    this.parameters = {
      width: width,
      height: height,
      depth: depth,
      widthSegments: widthSegments,
      heightSegments: heightSegments,
      depthSegments: depthSegments
    }; // segments

    const builder = new BoxGeometryBuilder(Math.floor(widthSegments), Math.floor(heightSegments), Math.floor(depthSegments)); // build each side of the box geometry

    builder.buildPlane(2, 1, 0, -1, -1, depth, height, width, depthSegments, heightSegments, 0, this); // px

    builder.buildPlane(2, 1, 0, 1, -1, depth, height, -width, depthSegments, heightSegments, 1, this); // nx

    builder.buildPlane(0, 2, 1, 1, 1, width, depth, height, widthSegments, depthSegments, 2, this); // py

    builder.buildPlane(0, 2, 1, 1, -1, width, depth, -height, widthSegments, depthSegments, 3, this); // ny

    builder.buildPlane(0, 1, 2, 1, -1, width, height, depth, widthSegments, heightSegments, 4, this); // pz

    builder.buildPlane(0, 1, 2, -1, -1, width, height, -depth, widthSegments, heightSegments, 5, this); // nz
    // build geometry

    this.setIndexes(builder.indices);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION, new Float32Array(builder.vertices), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL, new Float32Array(builder.normals), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV, new Float32Array(builder.uvs), 2);
  } // static fromJSON( data ) {
  // 	return new BoxGeometry( data.width, data.height, data.depth, data.widthSegments, data.heightSegments, data.depthSegments );
  // }


}

/***/ }),

/***/ "./src/ts/renderer/geometry/Geometry.ts":
/*!**********************************************!*\
  !*** ./src/ts/renderer/geometry/Geometry.ts ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Attribute": () => (/* binding */ Attribute),
/* harmony export */   "BufferGeometryGroup": () => (/* binding */ BufferGeometryGroup),
/* harmony export */   "Geometry": () => (/* binding */ Geometry)
/* harmony export */ });
/* harmony import */ var _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/WasmManager */ "./src/ts/core/WasmManager.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/AttributeType */ "./src/common/AttributeType.ts");
/* harmony import */ var _core_Utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/Utils */ "./src/ts/core/Utils.ts");



class BufferGeometryGroup {
  constructor(start, count) {
    let materialIndex = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    this.start = start;
    this.count = count;
    this.materialIndex = materialIndex;
  }

}
class Attribute {
  constructor(buffer, itemSize) {
    let normalized = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    this.itemSize = itemSize;
    this.normalized = normalized;
    this.buffer = buffer;
    this.gpuBuffer = null;
  }

  getX(index) {
    return this.buffer[index * this.itemSize];
  }

  setX(index, x) {
    this.buffer[index * this.itemSize] = x;
    return this;
  }

  getY(index) {
    return this.buffer[index * this.itemSize + 1];
  }

  setY(index, y) {
    this.buffer[index * this.itemSize + 1] = y;
    return this;
  }

  getZ(index) {
    return this.buffer[index * this.itemSize + 2];
  }

  setZ(index, z) {
    this.buffer[index * this.itemSize + 2] = z;
    return this;
  }

  getW(index) {
    return this.buffer[index * this.itemSize + 3];
  }

  setW(index, w) {
    this.buffer[index * this.itemSize + 3] = w;
    return this;
  }

  setXY(index, x, y) {
    index *= this.itemSize;
    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;
    return this;
  }

  setXYZ(index, x, y, z) {
    index *= this.itemSize;
    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;
    this.buffer[index + 2] = z;
    return this;
  }

  setXYZW(index, x, y, z, w) {
    index *= this.itemSize;
    this.buffer[index + 0] = x;
    this.buffer[index + 1] = y;
    this.buffer[index + 2] = z;
    this.buffer[index + 3] = w;
    return this;
  }

}
class Geometry {
  constructor() {
    this.name = "";
    this.attributes = new Map();
    this.groups = [];
    this.bufferGeometry = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.creatBufferGeometry();
    this.requiresBuild = true;
    this.indexBuffer = null;
  }

  build(manager) {
    this.requiresBuild = false;
    this.attributes.forEach((value, key) => {
      if (key === _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.NORMAL || key === _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.POSITION || key === _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.UV || key === _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.TANGENT) {
        const buffer = (0,_core_Utils__WEBPACK_IMPORTED_MODULE_2__.createBufferFromF32)(manager.device, value.buffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
        value.gpuBuffer = buffer;
      } else throw new Error(`Attribute ${_common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType[key]} not recognised`);
    });
    this.indexBuffer = (0,_core_Utils__WEBPACK_IMPORTED_MODULE_2__.createIndexBufferU32)(manager.device, this.indices);
    return this;
  }

  setAttribute(type, buffer, itemSize) {
    let normalized = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
    let attribute;
    if (buffer instanceof Attribute) attribute = buffer;else attribute = new Attribute(buffer, itemSize, normalized);
    this.attributes.set(type, attribute);

    if (buffer instanceof Float32Array) {
      const wasmAttribute = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createBufferAttributeF32(buffer, attribute.itemSize, attribute.normalized);
      _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.setBufferAttribute(this.bufferGeometry, type, wasmAttribute);
    }
  }

  setIndexes(buffer) {
    this.indices = new Uint32Array(buffer);
    const wasmAttribute = _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.createBufferAttributeu32(this.indices, 1, false);
    _core_WasmManager__WEBPACK_IMPORTED_MODULE_0__.wasm.setIndexAttribute(this.bufferGeometry, wasmAttribute);
  }

  addGroup(start, count) {
    let materialIndex = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    this.groups.push(new BufferGeometryGroup(start, count, materialIndex));
  }

  clearGroups() {
    this.groups = [];
  }

}

/***/ }),

/***/ "./src/ts/renderer/geometry/PlaneGeometry.ts":
/*!***************************************************!*\
  !*** ./src/ts/renderer/geometry/PlaneGeometry.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PlaneGeometry": () => (/* binding */ PlaneGeometry),
/* harmony export */   "PlaneGeometryParameters": () => (/* binding */ PlaneGeometryParameters)
/* harmony export */ });
/* harmony import */ var _Geometry__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Geometry */ "./src/ts/renderer/geometry/Geometry.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/AttributeType */ "./src/common/AttributeType.ts");


class PlaneGeometryParameters {}
class PlaneGeometry extends _Geometry__WEBPACK_IMPORTED_MODULE_0__.Geometry {
  constructor() {
    let width = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
    let height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
    let widthSegments = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
    let heightSegments = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;
    super();
    this.parameters = {
      width: width,
      height: height,
      widthSegments: widthSegments,
      heightSegments: heightSegments
    };
    const width_half = width / 2;
    const height_half = height / 2;
    const gridX = u32(Math.floor(widthSegments));
    const gridY = u32(Math.floor(heightSegments));
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
    const segment_width = width / gridX;
    const segment_height = height / gridY; //

    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segment_height - height_half;

      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segment_width - width_half;
        vertices.push(x);
        vertices.push(-y);
        vertices.push(0);
        normals.push(0);
        normals.push(0);
        normals.push(1);
        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY);
      }
    }

    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy;
        const b = ix + gridX1 * (iy + 1);
        const c = ix + 1 + gridX1 * (iy + 1);
        const d = ix + 1 + gridX1 * iy;
        indices.push(a);
        indices.push(b);
        indices.push(d);
        indices.push(b);
        indices.push(c);
        indices.push(d);
      }
    }

    this.setIndexes(indices);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.POSITION, new Float32Array(vertices), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.NORMAL, new Float32Array(normals), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_1__.AttributeType.UV, new Float32Array(uvs), 2);
  } // TODO:
  // static fromJSON( data ) {
  // 	return new PlaneGeometry( data.width, data.height, data.widthSegments, data.heightSegments );
  // }


}

/***/ }),

/***/ "./src/ts/renderer/geometry/SphereGeometry.ts":
/*!****************************************************!*\
  !*** ./src/ts/renderer/geometry/SphereGeometry.ts ***!
  \****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "SphereGeometry": () => (/* binding */ SphereGeometry),
/* harmony export */   "SphereGeometryParameters": () => (/* binding */ SphereGeometryParameters)
/* harmony export */ });
/* harmony import */ var _Geometry__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Geometry */ "./src/ts/renderer/geometry/Geometry.ts");
/* harmony import */ var _common_math_Vector3__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/math/Vector3 */ "./src/common/math/Vector3.ts");
/* harmony import */ var _common_AttributeType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../common/AttributeType */ "./src/common/AttributeType.ts");



class SphereGeometryParameters {}
class SphereGeometry extends _Geometry__WEBPACK_IMPORTED_MODULE_0__.Geometry {
  constructor() {
    let radius = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
    let widthSegments = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 32;
    let heightSegments = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 16;
    let phiStart = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    let phiLength = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : Mathf.PI * 2;
    let thetaStart = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 0;
    let thetaLength = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : Mathf.PI;
    super();
    this.parameters = {
      radius: radius,
      widthSegments: widthSegments,
      heightSegments: heightSegments,
      phiStart: phiStart,
      phiLength: phiLength,
      thetaStart: thetaStart,
      thetaLength: thetaLength
    };
    widthSegments = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));
    const thetaEnd = Mathf.min(thetaStart + thetaLength, Mathf.PI);
    let index = 0;
    const grid = [];
    const vertex = new _common_math_Vector3__WEBPACK_IMPORTED_MODULE_1__.Vector3();
    const normal = new _common_math_Vector3__WEBPACK_IMPORTED_MODULE_1__.Vector3(); // buffers

    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = []; // generate vertices, normals and uvs

    for (let iy = 0; iy <= heightSegments; iy++) {
      const verticesRow = [];
      const v = iy / heightSegments; // special case for the poles

      let uOffset = 0;

      if (iy == 0 && thetaStart == 0) {
        uOffset = 0.5 / widthSegments;
      } else if (iy == heightSegments && thetaEnd == Mathf.PI) {
        uOffset = -0.5 / widthSegments;
      }

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments; // vertex

        vertex.x = -radius * Mathf.cos(phiStart + u * phiLength) * Mathf.sin(thetaStart + v * thetaLength);
        vertex.y = radius * Mathf.cos(thetaStart + v * thetaLength);
        vertex.z = radius * Mathf.sin(phiStart + u * phiLength) * Mathf.sin(thetaStart + v * thetaLength);
        vertices.push(vertex.x);
        vertices.push(vertex.y);
        vertices.push(vertex.z); // normal

        normal.copy(vertex).normalize();
        normals.push(normal.x);
        normals.push(normal.y);
        normals.push(normal.z); // uv

        uvs.push(u + uOffset);
        uvs.push(1 - v);
        verticesRow.push(index++);
      }

      grid.push(verticesRow);
    } // indices


    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0 || thetaStart > 0) {
          indices.push(a);
          indices.push(b);
          indices.push(d);
        }

        if (iy !== heightSegments - 1 || thetaEnd < Mathf.PI) {
          indices.push(b);
          indices.push(c);
          indices.push(d);
        }
      }
    } // build geometry


    this.setIndexes(indices);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.POSITION, new Float32Array(vertices), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.NORMAL, new Float32Array(normals), 3);
    this.setAttribute(_common_AttributeType__WEBPACK_IMPORTED_MODULE_2__.AttributeType.UV, new Float32Array(uvs), 2);
  }

}

/***/ }),

/***/ "./src/ts/ui/application/Application.tsx":
/*!***********************************************!*\
  !*** ./src/ts/ui/application/Application.tsx ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Application": () => (/* binding */ Application)
/* harmony export */ });
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _core_UIEventManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/UIEventManager */ "./src/ts/core/UIEventManager.ts");
/* harmony import */ var _core_GameManager__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/GameManager */ "./src/ts/core/GameManager.ts");
/* harmony import */ var _core_WasmManager__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/WasmManager */ "./src/ts/core/WasmManager.ts");
/* harmony import */ var _common_Pane3D__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../common/Pane3D */ "./src/ts/ui/common/Pane3D.tsx");
/* harmony import */ var _InGameMenu__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./InGameMenu */ "./src/ts/ui/application/InGameMenu.tsx");
/* harmony import */ var _MainMenu__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./MainMenu */ "./src/ts/ui/application/MainMenu.tsx");
/* harmony import */ var _common_UIEventType__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../../common/UIEventType */ "./src/common/UIEventType.ts");
/* harmony import */ var _InGameUI__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./InGameUI */ "./src/ts/ui/application/InGameUI.tsx");
/* harmony import */ var _GameOverMenu__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./GameOverMenu */ "./src/ts/ui/application/GameOverMenu.tsx");
/* harmony import */ var _StartError__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./StartError */ "./src/ts/ui/application/StartError.tsx");
/* harmony import */ var _FPSCounter__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./FPSCounter */ "./src/ts/ui/application/FPSCounter.tsx");















const Application = _ref => {
  let {} = _ref;
  const [modalOpen, setModalOpen] = (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createSignal)(true);
  const [errorMessage, setErrorMessage] = (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createSignal)("");
  const [errorType, setErrorType] = (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createSignal)("OTHER");
  const [activeMenu, setActiveMenu] = (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createSignal)("main");
  const [gameIsRunning, setGameIsRunning] = (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createSignal)(false);
  let fpsDiv;
  let gameManager;
  let eventManager;
  const wasmManager = new _core_WasmManager__WEBPACK_IMPORTED_MODULE_2__.WasmManager();

  const onWasmUiEvent = event => {
    if (event.uiEventType === _common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.OpenInGameMenu) setModalOpen(!modalOpen());else if (event.uiEventType === _common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.PlayerDied) setActiveMenu("gameOverMenu");
  };

  const onFrameUpdate = () => {
    (0,_FPSCounter__WEBPACK_IMPORTED_MODULE_10__.update)(fpsDiv);
  };

  const onCanvasReady = async canvas => {
    gameManager = new _core_GameManager__WEBPACK_IMPORTED_MODULE_1__.GameManager(canvas);
    gameManager.updateCallbacks.push(onFrameUpdate);
    eventManager = new _core_UIEventManager__WEBPACK_IMPORTED_MODULE_0__.UIEventManager();
    const bindables = [gameManager, eventManager];

    try {
      await wasmManager.load(bindables);

      if (!gameManager.hasWebGPU()) {
        setErrorMessage("Your browser does not support WebGPU");
        setErrorType("WGPU");
        setActiveMenu("error");
        return;
      }

      await gameManager.init();
      eventManager.addEventListener("uievent", onWasmUiEvent);
    } catch (err) {
      setErrorMessage("An Error occurred while setting up the scene. Please check the console for more info.");
      setErrorType("OTHER");
      setActiveMenu("error");
      console.log(err);
    }
  };

  const onStart = () => {
    setModalOpen(false);
    setGameIsRunning(true);
    setActiveMenu("ingameMenu");
    eventManager.triggerUIEvent(_common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.StartGame);
  };

  const onResume = () => {
    setModalOpen(false);
    setGameIsRunning(true);
    eventManager.triggerUIEvent(_common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.Resume);
  };

  const onQuit = () => {
    setModalOpen(true);
    setActiveMenu("main");
    setGameIsRunning(false);
    eventManager.triggerUIEvent(_common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.QuitGame);
  };

  const options = {
    main: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_MainMenu__WEBPACK_IMPORTED_MODULE_5__.MainMenu, {
      get open() {
        return modalOpen();
      },

      onStart: onStart
    }),
    ingameMenu: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_InGameMenu__WEBPACK_IMPORTED_MODULE_4__.InGameMenu, {
      get open() {
        return modalOpen();
      },

      onResumeClick: onResume,
      onQuitClick: onQuit
    }),
    gameOverMenu: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_GameOverMenu__WEBPACK_IMPORTED_MODULE_8__.GameOverMenu, {
      onQuitClick: onQuit,
      open: true
    }),
    error: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_StartError__WEBPACK_IMPORTED_MODULE_9__.StartError, {
      open: true,

      get errorMsg() {
        return errorMessage();
      },

      get errorType() {
        return errorType();
      }

    })
  };
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(StyledApplication, {
    get children() {
      return [(0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(solid_js__WEBPACK_IMPORTED_MODULE_11__.Show, {
        get when() {
          return gameIsRunning();
        },

        get children() {
          return (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_InGameUI__WEBPACK_IMPORTED_MODULE_7__.InGameUI, {
            gameManager: gameManager
          });
        }

      }), (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(solid_js_web__WEBPACK_IMPORTED_MODULE_12__.Dynamic, {
        get component() {
          return options[activeMenu()];
        }

      }), (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(_common_Pane3D__WEBPACK_IMPORTED_MODULE_3__.Pane3D, {
        onCanvasReady: onCanvasReady
      }), (0,solid_js__WEBPACK_IMPORTED_MODULE_11__.createComponent)(StyledFPS, {
        ref(r$) {
          const _ref$ = fpsDiv;
          typeof _ref$ === "function" ? _ref$(r$) : fpsDiv = r$;
        },

        children: "0"
      })];
    }

  });
};
const StyledFPS = solid_styled_components__WEBPACK_IMPORTED_MODULE_13__.styled.div`
  width: 100px;
  color: white;
  font-size: 14px;
  height: 25px;
  padding: 5px;
  text-align: center;
  position: absolute;
  top: 0;
  left: 0;
  background: #255fa1;
`;
const StyledApplication = solid_styled_components__WEBPACK_IMPORTED_MODULE_13__.styled.div`
  width: 100%;
  height: 100%;
  margin: 0;
`;

/***/ }),

/***/ "./src/ts/ui/application/FPSCounter.tsx":
/*!**********************************************!*\
  !*** ./src/ts/ui/application/FPSCounter.tsx ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "update": () => (/* binding */ update)
/* harmony export */ });
let beginTime = performance.now();
let prevTime = beginTime;
let frameCount = 0;
let min = Infinity;
let max = 0;
const round = Math.round;

const end = elm => {
  frameCount++;
  let time = performance.now();

  if (time >= prevTime + 1000) {
    const value = frameCount * 1000 / (time - prevTime);
    min = Math.min(min, value);
    max = Math.max(max, value);
    elm.textContent = round(value) + " " + name + " (" + round(min) + "-" + round(max) + ")";
    prevTime = time;
    frameCount = 0;
  }

  return time;
};

const update = elm => {
  beginTime = end(elm);
};

/***/ }),

/***/ "./src/ts/ui/application/GameOverMenu.tsx":
/*!************************************************!*\
  !*** ./src/ts/ui/application/GameOverMenu.tsx ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "GameOverMenu": () => (/* binding */ GameOverMenu)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var _common_Modal__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/Modal */ "./src/ts/ui/common/Modal.tsx");
/* harmony import */ var _common_Button__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/Button */ "./src/ts/ui/common/Button.tsx");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _common_Typography__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../common/Typography */ "./src/ts/ui/common/Typography.tsx");





const GameOverMenu = props => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Modal__WEBPACK_IMPORTED_MODULE_0__.Modal, {
    hideConfirmButtons: true,

    get open() {
      return props.open;
    },

    withBackground: true,

    get children() {
      return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
        variant: "h2",
        children: "GAME OVER"
      }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(StyledButtons, {
        get children() {
          return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
            get onClick() {
              return props.onQuitClick;
            },

            fullWidth: true,
            children: "Quit"
          });
        }

      })];
    }

  });
};
const StyledButtons = solid_styled_components__WEBPACK_IMPORTED_MODULE_4__.styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

/***/ }),

/***/ "./src/ts/ui/application/InGameMenu.tsx":
/*!**********************************************!*\
  !*** ./src/ts/ui/application/InGameMenu.tsx ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "InGameMenu": () => (/* binding */ InGameMenu)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var _common_Modal__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/Modal */ "./src/ts/ui/common/Modal.tsx");
/* harmony import */ var _common_Button__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/Button */ "./src/ts/ui/common/Button.tsx");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");




const InGameMenu = props => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(_common_Modal__WEBPACK_IMPORTED_MODULE_0__.Modal, {
    hideConfirmButtons: true,

    get open() {
      return props.open;
    },

    withBackground: true,

    get children() {
      return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(StyledButtons, {
        get children() {
          return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(_common_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
            get onClick() {
              return props.onResumeClick;
            },

            fullWidth: true,
            children: "Resume"
          }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(_common_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
            get onClick() {
              return props.onQuitClick;
            },

            fullWidth: true,
            children: "Quit"
          })];
        }

      });
    }

  });
};
const StyledButtons = solid_styled_components__WEBPACK_IMPORTED_MODULE_3__.styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

/***/ }),

/***/ "./src/ts/ui/application/InGameUI.tsx":
/*!********************************************!*\
  !*** ./src/ts/ui/application/InGameUI.tsx ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "InGameUI": () => (/* binding */ InGameUI)
/* harmony export */ });
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _common_CircularProgress__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/CircularProgress */ "./src/ts/ui/common/CircularProgress.tsx");




const InGameUI = props => {
  const [playerHealth, setPlayerHealth] = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createSignal)(100);
  const [playerHunger, setPlayerHunger] = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createSignal)(100);

  const onFrameUpdate = () => {
    if (props.gameManager.player.health !== playerHealth()) {
      setPlayerHealth(props.gameManager.player.health);
    }

    if (props.gameManager.player.hunger !== playerHunger()) {
      setPlayerHunger(props.gameManager.player.hunger);
    }
  };

  props.gameManager.updateCallbacks.push(onFrameUpdate);
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(StyledContainer, {
    get children() {
      return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(StyledFooter, {
        get children() {
          return [(0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(_common_CircularProgress__WEBPACK_IMPORTED_MODULE_0__.CircularProgress, {
            size: 120,

            get value() {
              return playerHealth();
            },

            strokeSize: 20
          }), (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(_common_CircularProgress__WEBPACK_IMPORTED_MODULE_0__.CircularProgress, {
            size: 80,

            get value() {
              return playerHunger();
            },

            strokeSize: 14
          })];
        }

      });
    }

  });
};
const StyledContainer = solid_styled_components__WEBPACK_IMPORTED_MODULE_2__.styled.div`
  width: 100%;
  height: 100%;
  position: absolute;
  pointer-events: none;
`;
const StyledFooter = solid_styled_components__WEBPACK_IMPORTED_MODULE_2__.styled.div`
  pointer-events: initial;
  width: 90%;
  height: 5%;
  min-height: 50px;
  position: absolute;
  bottom: 30px;
  margin: 0 0 0 5%;
  border-radius: 10px;
  box-sizing: border-box;
  color: white;
  justify-content: center;
  align-items: center;
  display: flex;

  > div {
    flex: 0 1 auto;
  }
`;

/***/ }),

/***/ "./src/ts/ui/application/MainMenu.tsx":
/*!********************************************!*\
  !*** ./src/ts/ui/application/MainMenu.tsx ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "MainMenu": () => (/* binding */ MainMenu)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var _common_Modal__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/Modal */ "./src/ts/ui/common/Modal.tsx");
/* harmony import */ var _common_Button__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/Button */ "./src/ts/ui/common/Button.tsx");
/* harmony import */ var _common_Typography__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../common/Typography */ "./src/ts/ui/common/Typography.tsx");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");





const MainMenu = props => {
  const onOptionsClick = () => {};

  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Modal__WEBPACK_IMPORTED_MODULE_0__.Modal, {
    hideConfirmButtons: true,

    get open() {
      return props.open;
    },

    title: "Rewild",

    get children() {
      return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
        variant: "body2",
        children: "Welcome to rewild. A game about exploration, natural history and saving the planet"
      }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(StyledButtons, {
        get children() {
          return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
            get onClick() {
              return props.onStart;
            },

            fullWidth: true,
            children: "New Game"
          }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
            onClick: onOptionsClick,
            fullWidth: true,
            disabled: true,
            children: "Options"
          })];
        }

      })];
    }

  });
};
const StyledButtons = solid_styled_components__WEBPACK_IMPORTED_MODULE_4__.styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

/***/ }),

/***/ "./src/ts/ui/application/StartError.tsx":
/*!**********************************************!*\
  !*** ./src/ts/ui/application/StartError.tsx ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "StartError": () => (/* binding */ StartError)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var _common_Modal__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/Modal */ "./src/ts/ui/common/Modal.tsx");
/* harmony import */ var _common_Typography__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../common/Typography */ "./src/ts/ui/common/Typography.tsx");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");




const _tmpl$ = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<a href="https://www.google.com/intl/en_ie/chrome/canary/">Chrome Canary</a>`, 2),
      _tmpl$2 = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<pre>chrome://flags/#enable-unsafe-webgpu</pre>`, 2),
      _tmpl$3 = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<a href="https://www.mozilla.org/en-US/firefox/channel/desktop/">Firefox Nightly</a>`, 2),
      _tmpl$4 = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<pre>dom.webgpu.enabled and gfx.webrender.all</pre>`, 2);





const StartError = props => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Modal__WEBPACK_IMPORTED_MODULE_1__.Modal, {
    hideConfirmButtons: true,

    get open() {
      return props.open;
    },

    get title() {
      return props.errorType === "WGPU" ? "WebGPU Not Supported" : "An Error Occurred";
    },

    get children() {
      return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(StyledButtons, {
        get children() {
          return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(solid_js_web__WEBPACK_IMPORTED_MODULE_3__.Show, {
            get when() {
              return props.errorType === "WGPU";
            },

            get fallback() {
              return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
                variant: "body2",

                get children() {
                  return props.errorMsg;
                }

              });
            },

            get children() {
              return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
                variant: "body1",

                get children() {
                  return ["WebGPU is available for now in ", _tmpl$.cloneNode(true), " ", "on desktop behind an experimental flag. You can enable with the following flag:", _tmpl$2.cloneNode(true)];
                }

              }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
                variant: "body1",

                get children() {
                  return ["Work is also in progress in", " ", _tmpl$3.cloneNode(true), ", enabled by the prefs below: ", _tmpl$4.cloneNode(true)];
                }

              }), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_2__.Typography, {
                variant: "body1",
                children: "The API is constantly changing and currently unsafe."
              })];
            }

          });
        }

      });
    }

  });
};
const StyledButtons = solid_styled_components__WEBPACK_IMPORTED_MODULE_4__.styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

/***/ }),

/***/ "./src/ts/ui/common/Button.tsx":
/*!*************************************!*\
  !*** ./src/ts/ui/common/Button.tsx ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Button": () => (/* binding */ Button)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");



const Button = props => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.createComponent)(StyledButton, {
    get fullWidth() {
      return props.fullWidth || false;
    },

    get disabled() {
      return props.disabled;
    },

    get onClick() {
      return props.onClick;
    },

    get className() {
      return `${props.class} ${props.variant || "contained"} ${props.color || "primary"}`;
    },

    get children() {
      return props.children;
    }

  });
};
const StyledButton = solid_styled_components__WEBPACK_IMPORTED_MODULE_1__.styled.button`
  padding: 0.5rem 1rem;
  border-radius: 5px;
  border: none;
  text-transform: uppercase;
  font-weight: 500;
  font-family: var(--font-family);
  font-weight: 400;
  cursor: pointer;
  user-select: none;
  ${e => e.fullWidth ? "width: 100%;" : ""}
  transition: box-shadow 0.25s, background-color 0.25s;
  display: ${e => e.fullWidth ? "block" : "inline-block"};

  &[disabled],
  &[disabled]:hover {
    opacity: 0.65;
    pointer-events: none;
  }

  &.contained {
    box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
  }

  &.contained:hover {
    box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
  }

  &.contained.primary {
    background: var(--primary-400);
    color: var(--on-primary-400);
  }
  &.contained.primary:hover {
    background: var(--primary-500);
    color: var(--on-primary-500);
  }
  &.contained.primary:active {
    background: var(--primary-600);
    color: var(--on-primary-600);
  }

  &.contained.secondary {
    background: var(--secondary-400);
    color: var(--on-secondary-400);
  }
  &.contained.secondary:hover {
    background: var(--secondary-500);
    color: var(--on-secondary-500);
  }
  &.contained.secondary:active {
    background: var(--secondary-600);
    color: var(--on-secondary-600);
  }

  &.contained.error {
    background: var(--error-400);
    color: var(--on-errory-400);
  }
  &.contained.error:hover {
    background: var(--error-500);
    color: var(--on-error-500);
  }
  &.contained.error:active {
    background: var(--error-600);
    color: var(--on-error-600);
  }

  &.outlined {
    background: transparent;
  }
  &.outlined:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  &.outlined:active {
    background: rgba(0, 0, 0, 0.1);
  }

  &.outlined.primary {
    color: var(--primary-400);
    border: 1px solid var(--primary-400);
  }
  &.outlined.secondary {
    color: var(--secondary-400);
    border: 1px solid var(--secondary-400);
  }
  &.outlined.error {
    color: var(--errory-400);
    border: 1px solid var(--errory-400);
  }
`;

/***/ }),

/***/ "./src/ts/ui/common/CircularProgress.tsx":
/*!***********************************************!*\
  !*** ./src/ts/ui/common/CircularProgress.tsx ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "CircularProgress": () => (/* binding */ CircularProgress)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _common_math_MathUtils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../common/math/MathUtils */ "./src/common/math/MathUtils.ts");





const _tmpl$ = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<svg id="svg" version="1.1" xmlns="http://www.w3.org/2000/svg"><linearGradient x1="1" x2="0.5" y1="1" y2="0.5"><stop class="stop1" offset="0%"></stop><stop class="stop2" offset="100%"></stop></linearGradient><circle fill="transparent" stroke-dashoffset="0"></circle><circle id="bar" fill="transparent" stroke="url(#$gradient)"></circle></svg>`, 12);



const CircularProgress = props => {
  //https://codepen.io/JMChristensen/pen/AGbeEy
  let circleBar;
  const radius = props.size / 2 - props.strokeSize / 2;
  const c = Math.PI * (radius * 2);

  const val = () => {
    let val = props.value;

    if (val < 0) {
      val = 0;
    }

    if (val > 100) {
      val = 100;
    }

    const pct = (100 - val) / 100 * c + c;
    if (circleBar) circleBar.style.strokeDashoffset = `${pct}px`;
    return val;
  };

  const pct = (100 - val()) / 100 * c + c;
  const gradientId = (0,_common_math_MathUtils__WEBPACK_IMPORTED_MODULE_1__.generateUUID)();
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(StyledDiv, {
    gradientId: gradientId,

    get val() {
      return val();
    },

    get size() {
      return props.size;
    },

    get strokeSize() {
      return props.strokeSize;
    },

    get children() {
      return [(() => {
        const _el$ = _tmpl$.cloneNode(true),
              _el$2 = _el$.firstChild,
              _el$3 = _el$2.firstChild,
              _el$4 = _el$3.nextSibling,
              _el$5 = _el$2.nextSibling,
              _el$6 = _el$5.nextSibling;

        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$2, "id", gradientId);

        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$5, "r", radius);

        const _ref$ = circleBar;
        typeof _ref$ === "function" ? _ref$(_el$6) : circleBar = _el$6;

        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$6, "r", radius);

        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$6, "stroke-dashoffset", pct);

        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createRenderEffect)(_p$ => {
          const _v$ = props.size,
                _v$2 = props.size,
                _v$3 = `0 0 ${props.size} ${props.size}`,
                _v$4 = val() < 50 ? "#ff0000" : "#eeff50",
                _v$5 = val() < 50 ? "#eeff50" : "#9198e5",
                _v$6 = props.size / 2,
                _v$7 = props.size / 2,
                _v$8 = (c * 2).toFixed(2),
                _v$9 = props.size / 2,
                _v$10 = props.size / 2,
                _v$11 = (c * 2).toFixed(2);

          _v$ !== _p$._v$ && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$, "width", _p$._v$ = _v$);
          _v$2 !== _p$._v$2 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$, "height", _p$._v$2 = _v$2);
          _v$3 !== _p$._v$3 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$, "viewBox", _p$._v$3 = _v$3);
          _v$4 !== _p$._v$4 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$3, "stop-color", _p$._v$4 = _v$4);
          _v$5 !== _p$._v$5 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$4, "stop-color", _p$._v$5 = _v$5);
          _v$6 !== _p$._v$6 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$5, "cx", _p$._v$6 = _v$6);
          _v$7 !== _p$._v$7 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$5, "cy", _p$._v$7 = _v$7);
          _v$8 !== _p$._v$8 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$5, "stroke-dasharray", _p$._v$8 = _v$8);
          _v$9 !== _p$._v$9 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$6, "cx", _p$._v$9 = _v$9);
          _v$10 !== _p$._v$10 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$6, "cy", _p$._v$10 = _v$10);
          _v$11 !== _p$._v$11 && (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.setAttribute)(_el$6, "stroke-dasharray", _p$._v$11 = _v$11);
          return _p$;
        }, {
          _v$: undefined,
          _v$2: undefined,
          _v$3: undefined,
          _v$4: undefined,
          _v$5: undefined,
          _v$6: undefined,
          _v$7: undefined,
          _v$8: undefined,
          _v$9: undefined,
          _v$10: undefined,
          _v$11: undefined
        });

        return _el$;
      })(), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(StyledLabel, {
        get size() {
          return props.size;
        },

        get strokeSize() {
          return props.strokeSize;
        },

        get children() {
          return val();
        }

      })];
    }

  });
};
const StyledLabel = solid_styled_components__WEBPACK_IMPORTED_MODULE_3__.styled.div`
  position: absolute;
  display: block;
  height: ${e => e.size - e.strokeSize * 2}px;
  width: ${e => e.size - e.strokeSize * 2}px;
  left: 50%;
  top: 50%;
  box-shadow: inset 0 0 1em black;
  margin-top: -${e => e.size / 2 - e.strokeSize}px;
  margin-left: -${e => e.size / 2 - e.strokeSize}px;
  border-radius: 100%;
  line-height: ${e => e.size - e.strokeSize * 2}px;
  font-size: 1.5em;
  text-shadow: 0 0 0.5em black;
  text-align: center;
`;
const StyledDiv = solid_styled_components__WEBPACK_IMPORTED_MODULE_3__.styled.div`
  display: inline-block;
  height: ${e => e.size}px;
  width: ${e => e.size}px;
  box-shadow: 0 0 1em black;
  border-radius: 100%;
  position: relative;

  stop {
    transition: stop-color 5s;
  }

  circle {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.3s linear, stroke 2s linear;
    stroke: #666;
    stroke-width: ${e => e.strokeSize}px;
  }

  #bar {
    stroke: url(#${e => e.gradientId});
  }
`;

/***/ }),

/***/ "./src/ts/ui/common/Modal.tsx":
/*!************************************!*\
  !*** ./src/ts/ui/common/Modal.tsx ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Modal": () => (/* binding */ Modal)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _Button__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Button */ "./src/ts/ui/common/Button.tsx");





const _tmpl$ = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<span class="title"></span>`, 2),
      _tmpl$2 = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<div class="content"></div>`, 2),
      _tmpl$3 = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<div class="button-container"></div>`, 2);





const Modal = props => {
  const handleClick = e => {
    if (e.target.classList.contains("wrapper")) {
      props.onClose && props.onClose();
    }
  };

  const handleCancel = e => {
    props.onCancel && props.onCancel();
    props.onClose && props.onClose();
  };

  const handleOk = e => {
    props.onOk && props.onOk();
    props.onClose && props.onClose();
  };

  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(solid_js_web__WEBPACK_IMPORTED_MODULE_0__.Portal, {
    get children() {
      return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(StyledWrapper, {
        "class": "wrapper",
        onClick: handleClick,

        get visible() {
          return props.open;
        },

        get withBackground() {
          return props.withBackground || false;
        },

        get children() {
          return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(StyledModal, {
            "class": "modal",

            get children() {
              return [(0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(solid_js_web__WEBPACK_IMPORTED_MODULE_2__.Show, {
                get when() {
                  return props.title;
                },

                get children() {
                  const _el$ = _tmpl$.cloneNode(true);

                  (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.insert)(_el$, () => props.title);

                  return _el$;
                }

              }), (() => {
                const _el$2 = _tmpl$2.cloneNode(true);

                (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.insert)(_el$2, () => props.children);

                return _el$2;
              })(), (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.memo)(() => (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.memo)(() => !!props.hideConfirmButtons, true)() ? null : (() => {
                const _el$3 = _tmpl$3.cloneNode(true);

                (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.insert)(_el$3, (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
                  onClick: handleCancel,
                  "class": "cancel",
                  variant: "outlined",
                  children: "Cancel"
                }), null);

                (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.insert)(_el$3, (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.createComponent)(_Button__WEBPACK_IMPORTED_MODULE_1__.Button, {
                  onClick: handleOk,
                  "class": "ok",
                  children: "Okay"
                }), null);

                return _el$3;
              })())];
            }

          });
        }

      });
    }

  });
};
const StyledWrapper = solid_styled_components__WEBPACK_IMPORTED_MODULE_3__.styled.div`
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: ${e => e.withBackground ? `rgba(0, 0, 0, 0.5);` : ""};
  opacity: 0;
  visibility: hidden;
  transform: scale(1.1);
  transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
  z-index: 1;

  ${e => e.visible ? `opacity: 1;
  visibility: visible;
  transform: scale(1);
  transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;` : ""}
`;
const StyledModal = solid_styled_components__WEBPACK_IMPORTED_MODULE_3__.styled.div`
  padding: 1rem;
  background-color: var(--surface);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 5px;
  min-width: 300px;
  box-shadow: 2px 2px 2px 4px rgba(0, 0, 0, 0.1);

  .title {
    font-size: 18px;
  }
  .button-container {
    text-align: right;
  }
  .button-container > button {
    margin: 0 0 0 4px;
  }
  .content {
    padding: 0.5rem 0;
  }
`;

/***/ }),

/***/ "./src/ts/ui/common/Pane3D.tsx":
/*!*************************************!*\
  !*** ./src/ts/ui/common/Pane3D.tsx ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Pane3D": () => (/* binding */ Pane3D)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");



const _tmpl$ = /*#__PURE__*/(0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.template)(`<canvas></canvas>`, 2);



const Pane3D = props => {
  let parent;

  const onResizeDelegate = () => {
    const canvas = parent.firstElementChild;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  };

  (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.onMount)(() => {
    window.addEventListener("resize", onResizeDelegate);
    onResizeDelegate();
  });
  (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.onCleanup)(() => {
    window.removeEventListener("resize", onResizeDelegate);
  });
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(StyledCanvas, {
    ref(r$) {
      const _ref$ = parent;
      typeof _ref$ === "function" ? _ref$(r$) : parent = r$;
    },

    get children() {
      const _el$ = _tmpl$.cloneNode(true);

      const _ref$2 = props.onCanvasReady;
      typeof _ref$2 === "function" ? _ref$2(_el$) : props.onCanvasReady = _el$;
      return _el$;
    }

  });
};
const StyledCanvas = solid_styled_components__WEBPACK_IMPORTED_MODULE_2__.styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: block;
`;

/***/ }),

/***/ "./src/ts/ui/common/Typography.tsx":
/*!*****************************************!*\
  !*** ./src/ts/ui/common/Typography.tsx ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Typography": () => (/* binding */ Typography)
/* harmony export */ });
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");


const Typography = props => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_0__.createComponent)(StyledTypography, {
    get className() {
      return `typography ${props.variant}`;
    },

    get style() {
      return {
        textAlign: props.align
      };
    },

    get children() {
      return props.children;
    }

  });
};
const StyledTypography = solid_styled_components__WEBPACK_IMPORTED_MODULE_1__.styled.div`
  margin: 0;
  font-family: var(--font-family);
  margin-bottom: 0.35em;

  .h1 {
    font-weight: 300;
    font-size: 6rem;
    line-height: 1.167;
    letter-spacing: -0.01562em;
  }

  .h2 {
    font-weight: 300;
    font-size: 3.75rem;
    line-height: 1.2;
    letter-spacing: -0.00833em;
  }

  .h3 {
    font-weight: 400;
    font-size: 3rem;
    line-height: 1.167;
    letter-spacing: 0em;
  }

  .h4 {
    font-weight: 400;
    font-size: 2.125rem;
    line-height: 1.235;
    letter-spacing: 0.00735em;
  }

  .body1 {
    font-weight: 400;
    font-size: 1rem;
    line-height: 1.5;
    letter-spacing: 0.00938em;
  }

  .body2 {
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.43;
    letter-spacing: 0.01071em;
  }
`;

/***/ }),

/***/ "./src/ts/ui/theme.tsx":
/*!*****************************!*\
  !*** ./src/ts/ui/theme.tsx ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "theme": () => (/* binding */ theme)
/* harmony export */ });
const theme = {
  colors: {
    primary: "hotpink"
  }
};

/***/ }),

/***/ "./build/release.wasm":
/*!****************************!*\
  !*** ./build/release.wasm ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (__webpack_require__.p + "release.wasm");

/***/ }),

/***/ "./node_modules/goober/dist/goober.modern.js":
/*!***************************************************!*\
  !*** ./node_modules/goober/dist/goober.modern.js ***!
  \***************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "css": () => (/* binding */ u),
/* harmony export */   "extractCss": () => (/* binding */ r),
/* harmony export */   "glob": () => (/* binding */ b),
/* harmony export */   "keyframes": () => (/* binding */ h),
/* harmony export */   "setup": () => (/* binding */ m),
/* harmony export */   "styled": () => (/* binding */ j)
/* harmony export */ });
let e={data:""},t=t=>"object"==typeof window?((t?t.querySelector("#_goober"):window._goober)||Object.assign((t||document.head).appendChild(document.createElement("style")),{innerHTML:" ",id:"_goober"})).firstChild:t||e,r=e=>{let r=t(e),l=r.data;return r.data="",l},l=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,a=/\/\*[^]*?\*\/|  +/g,n=/\n+/g,o=(e,t)=>{let r="",l="",a="";for(let n in e){let c=e[n];"@"==n[0]?"i"==n[1]?r=n+" "+c+";":l+="f"==n[1]?o(c,n):n+"{"+o(c,"k"==n[1]?"":t)+"}":"object"==typeof c?l+=o(c,t?t.replace(/([^,])+/g,e=>n.replace(/(^:.*)|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):n):null!=c&&(n=/^--/.test(n)?n:n.replace(/[A-Z]/g,"-$&").toLowerCase(),a+=o.p?o.p(n,c):n+":"+c+";")}return r+(t&&a?t+"{"+a+"}":a)+l},c={},s=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+s(e[r]);return t}return e},i=(e,t,r,i,p)=>{let u=s(e),d=c[u]||(c[u]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(u));if(!c[d]){let t=u!==e?e:(e=>{let t,r,o=[{}];for(;t=l.exec(e.replace(a,""));)t[4]?o.shift():t[3]?(r=t[3].replace(n," ").trim(),o.unshift(o[0][r]=o[0][r]||{})):o[0][t[1]]=t[2].replace(n," ").trim();return o[0]})(e);c[d]=o(p?{["@keyframes "+d]:t}:t,r?"":"."+d)}return((e,t,r)=>{-1==t.data.indexOf(e)&&(t.data=r?e+t.data:t.data+e)})(c[d],t,i),d},p=(e,t,r)=>e.reduce((e,l,a)=>{let n=t[a];if(n&&n.call){let e=n(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;n=t?"."+t:e&&"object"==typeof e?e.props?"":o(e,""):!1===e?"":e}return e+l+(null==n?"":n)},"");function u(e){let r=this||{},l=e.call?e(r.p):e;return i(l.unshift?l.raw?p(l,[].slice.call(arguments,1),r.p):l.reduce((e,t)=>Object.assign(e,t&&t.call?t(r.p):t),{}):l,t(r.target),r.g,r.o,r.k)}let d,f,g,b=u.bind({g:1}),h=u.bind({k:1});function m(e,t,r,l){o.p=t,d=e,f=r,g=l}function j(e,t){let r=this||{};return function(){let l=arguments;function a(n,o){let c=Object.assign({},n),s=c.className||a.className;r.p=Object.assign({theme:f&&f()},c),r.o=/ *go\d+/.test(s),c.className=u.apply(r,l)+(s?" "+s:""),t&&(c.ref=o);let i=e;return e[0]&&(i=c.as||e,delete c.as),g&&i[0]&&g(c),d(i,c)}return t?t(a):a}}


/***/ }),

/***/ "./node_modules/solid-js/dist/dev.js":
/*!*******************************************!*\
  !*** ./node_modules/solid-js/dist/dev.js ***!
  \*******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "$DEVCOMP": () => (/* binding */ $DEVCOMP),
/* harmony export */   "$PROXY": () => (/* binding */ $PROXY),
/* harmony export */   "DEV": () => (/* binding */ DEV),
/* harmony export */   "ErrorBoundary": () => (/* binding */ ErrorBoundary),
/* harmony export */   "For": () => (/* binding */ For),
/* harmony export */   "Index": () => (/* binding */ Index),
/* harmony export */   "Match": () => (/* binding */ Match),
/* harmony export */   "Show": () => (/* binding */ Show),
/* harmony export */   "Suspense": () => (/* binding */ Suspense),
/* harmony export */   "SuspenseList": () => (/* binding */ SuspenseList),
/* harmony export */   "Switch": () => (/* binding */ Switch),
/* harmony export */   "batch": () => (/* binding */ batch),
/* harmony export */   "cancelCallback": () => (/* binding */ cancelCallback),
/* harmony export */   "children": () => (/* binding */ children),
/* harmony export */   "createComponent": () => (/* binding */ createComponent),
/* harmony export */   "createComputed": () => (/* binding */ createComputed),
/* harmony export */   "createContext": () => (/* binding */ createContext),
/* harmony export */   "createDeferred": () => (/* binding */ createDeferred),
/* harmony export */   "createEffect": () => (/* binding */ createEffect),
/* harmony export */   "createMemo": () => (/* binding */ createMemo),
/* harmony export */   "createReaction": () => (/* binding */ createReaction),
/* harmony export */   "createRenderEffect": () => (/* binding */ createRenderEffect),
/* harmony export */   "createResource": () => (/* binding */ createResource),
/* harmony export */   "createRoot": () => (/* binding */ createRoot),
/* harmony export */   "createSelector": () => (/* binding */ createSelector),
/* harmony export */   "createSignal": () => (/* binding */ createSignal),
/* harmony export */   "createUniqueId": () => (/* binding */ createUniqueId),
/* harmony export */   "enableExternalSource": () => (/* binding */ enableExternalSource),
/* harmony export */   "enableHydration": () => (/* binding */ enableHydration),
/* harmony export */   "enableScheduling": () => (/* binding */ enableScheduling),
/* harmony export */   "equalFn": () => (/* binding */ equalFn),
/* harmony export */   "from": () => (/* binding */ from),
/* harmony export */   "getListener": () => (/* binding */ getListener),
/* harmony export */   "getOwner": () => (/* binding */ getOwner),
/* harmony export */   "indexArray": () => (/* binding */ indexArray),
/* harmony export */   "lazy": () => (/* binding */ lazy),
/* harmony export */   "mapArray": () => (/* binding */ mapArray),
/* harmony export */   "mergeProps": () => (/* binding */ mergeProps),
/* harmony export */   "observable": () => (/* binding */ observable),
/* harmony export */   "on": () => (/* binding */ on),
/* harmony export */   "onCleanup": () => (/* binding */ onCleanup),
/* harmony export */   "onError": () => (/* binding */ onError),
/* harmony export */   "onMount": () => (/* binding */ onMount),
/* harmony export */   "refetchResources": () => (/* binding */ refetchResources),
/* harmony export */   "requestCallback": () => (/* binding */ requestCallback),
/* harmony export */   "resetErrorBoundaries": () => (/* binding */ resetErrorBoundaries),
/* harmony export */   "runWithOwner": () => (/* binding */ runWithOwner),
/* harmony export */   "sharedConfig": () => (/* binding */ sharedConfig),
/* harmony export */   "splitProps": () => (/* binding */ splitProps),
/* harmony export */   "startTransition": () => (/* binding */ startTransition),
/* harmony export */   "untrack": () => (/* binding */ untrack),
/* harmony export */   "useContext": () => (/* binding */ useContext),
/* harmony export */   "useTransition": () => (/* binding */ useTransition)
/* harmony export */ });
let taskIdCounter = 1,
    isCallbackScheduled = false,
    isPerformingWork = false,
    taskQueue = [],
    currentTask = null,
    shouldYieldToHost = null,
    yieldInterval = 5,
    deadline = 0,
    maxYieldInterval = 300,
    scheduleCallback = null,
    scheduledCallback = null;
const maxSigned31BitInt = 1073741823;
function setupScheduler() {
  const channel = new MessageChannel(),
        port = channel.port2;
  scheduleCallback = () => port.postMessage(null);
  channel.port1.onmessage = () => {
    if (scheduledCallback !== null) {
      const currentTime = performance.now();
      deadline = currentTime + yieldInterval;
      const hasTimeRemaining = true;
      try {
        const hasMoreWork = scheduledCallback(hasTimeRemaining, currentTime);
        if (!hasMoreWork) {
          scheduledCallback = null;
        } else port.postMessage(null);
      } catch (error) {
        port.postMessage(null);
        throw error;
      }
    }
  };
  if (navigator && navigator.scheduling && navigator.scheduling.isInputPending) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = () => {
      const currentTime = performance.now();
      if (currentTime >= deadline) {
        if (scheduling.isInputPending()) {
          return true;
        }
        return currentTime >= maxYieldInterval;
      } else {
        return false;
      }
    };
  } else {
    shouldYieldToHost = () => performance.now() >= deadline;
  }
}
function enqueue(taskQueue, task) {
  function findIndex() {
    let m = 0;
    let n = taskQueue.length - 1;
    while (m <= n) {
      const k = n + m >> 1;
      const cmp = task.expirationTime - taskQueue[k].expirationTime;
      if (cmp > 0) m = k + 1;else if (cmp < 0) n = k - 1;else return k;
    }
    return m;
  }
  taskQueue.splice(findIndex(), 0, task);
}
function requestCallback(fn, options) {
  if (!scheduleCallback) setupScheduler();
  let startTime = performance.now(),
      timeout = maxSigned31BitInt;
  if (options && options.timeout) timeout = options.timeout;
  const newTask = {
    id: taskIdCounter++,
    fn,
    startTime,
    expirationTime: startTime + timeout
  };
  enqueue(taskQueue, newTask);
  if (!isCallbackScheduled && !isPerformingWork) {
    isCallbackScheduled = true;
    scheduledCallback = flushWork;
    scheduleCallback();
  }
  return newTask;
}
function cancelCallback(task) {
  task.fn = null;
}
function flushWork(hasTimeRemaining, initialTime) {
  isCallbackScheduled = false;
  isPerformingWork = true;
  try {
    return workLoop(hasTimeRemaining, initialTime);
  } finally {
    currentTask = null;
    isPerformingWork = false;
  }
}
function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  currentTask = taskQueue[0] || null;
  while (currentTask !== null) {
    if (currentTask.expirationTime > currentTime && (!hasTimeRemaining || shouldYieldToHost())) {
      break;
    }
    const callback = currentTask.fn;
    if (callback !== null) {
      currentTask.fn = null;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      callback(didUserCallbackTimeout);
      currentTime = performance.now();
      if (currentTask === taskQueue[0]) {
        taskQueue.shift();
      }
    } else taskQueue.shift();
    currentTask = taskQueue[0] || null;
  }
  return currentTask !== null;
}

const sharedConfig = {};
function setHydrateContext(context) {
  sharedConfig.context = context;
}
function nextHydrateContext() {
  return { ...sharedConfig.context,
    id: `${sharedConfig.context.id}${sharedConfig.context.count++}-`,
    count: 0
  };
}

const equalFn = (a, b) => a === b;
const $PROXY = Symbol("solid-proxy");
const $DEVCOMP = Symbol("solid-dev-component");
const signalOptions = {
  equals: equalFn
};
let ERROR = null;
let runEffects = runQueue;
const NOTPENDING = {};
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
const [transPending, setTransPending] = /*@__PURE__*/createSignal(false);
var Owner = null;
let Transition = null;
let Scheduler = null;
let ExternalSourceFactory = null;
let Listener = null;
let Pending = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
let rootCount = 0;
function createRoot(fn, detachedOwner) {
  const listener = Listener,
        owner = Owner,
        root = fn.length === 0 && !"_SOLID_DEV_" ? 0 : {
    owned: null,
    cleanups: null,
    context: null,
    owner: detachedOwner || owner
  };
  if (owner) root.name = `${owner.name}-r${rootCount++}`;
  Owner = root;
  Listener = null;
  try {
    return runUpdates(() => fn(() => cleanNode(root)), true);
  } finally {
    Listener = listener;
    Owner = owner;
  }
}
function createSignal(value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const s = {
    value,
    observers: null,
    observerSlots: null,
    pending: NOTPENDING,
    comparator: options.equals || undefined
  };
  if (!options.internal) s.name = registerGraph(options.name || hashValue(value), s);
  const setter = value => {
    if (typeof value === "function") {
      if (Transition && Transition.running && Transition.sources.has(s)) value = value(s.pending !== NOTPENDING ? s.pending : s.tValue);else value = value(s.pending !== NOTPENDING ? s.pending : s.value);
    }
    return writeSignal(s, value);
  };
  return [readSignal.bind(s), setter];
}
function createComputed(fn, value, options) {
  const c = createComputation(fn, value, true, STALE, options );
  if (Scheduler && Transition && Transition.running) Updates.push(c);else updateComputation(c);
}
function createRenderEffect(fn, value, options) {
  const c = createComputation(fn, value, false, STALE, options );
  if (Scheduler && Transition && Transition.running) Updates.push(c);else updateComputation(c);
}
function createEffect(fn, value, options) {
  runEffects = runUserEffects;
  const c = createComputation(fn, value, false, STALE, options ),
        s = SuspenseContext && lookup(Owner, SuspenseContext.id);
  if (s) c.suspense = s;
  c.user = true;
  Effects ? Effects.push(c) : queueMicrotask(() => updateComputation(c));
}
function createReaction(onInvalidate, options) {
  let fn;
  const c = createComputation(() => {
    fn ? fn() : untrack(onInvalidate);
    fn = undefined;
  }, undefined, false, 0, options ),
        s = SuspenseContext && lookup(Owner, SuspenseContext.id);
  if (s) c.suspense = s;
  c.user = true;
  return tracking => {
    fn = tracking;
    updateComputation(c);
  };
}
function createMemo(fn, value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const c = createComputation(fn, value, true, 0, options );
  c.pending = NOTPENDING;
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || undefined;
  if (Scheduler && Transition && Transition.running) {
    c.tState = STALE;
    Updates.push(c);
  } else updateComputation(c);
  return readSignal.bind(c);
}
function createResource(source, fetcher, options) {
  if (arguments.length === 2) {
    if (typeof fetcher === "object") {
      options = fetcher;
      fetcher = source;
      source = true;
    }
  } else if (arguments.length === 1) {
    fetcher = source;
    source = true;
  }
  options || (options = {});
  if (options.globalRefetch !== false) {
    Resources || (Resources = new Set());
    Resources.add(load);
    Owner && onCleanup(() => Resources.delete(load));
  }
  const contexts = new Set(),
        [s, set] = createSignal(options.initialValue),
        [track, trigger] = createSignal(undefined, {
    equals: false
  }),
        [loading, setLoading] = createSignal(false),
        [error, setError] = createSignal();
  let err = undefined,
      pr = null,
      initP = null,
      id = null,
      loadedUnderTransition = false,
      scheduled = false,
      dynamic = typeof source === "function";
  if (sharedConfig.context) {
    id = `${sharedConfig.context.id}${sharedConfig.context.count++}`;
    if (sharedConfig.load) initP = sharedConfig.load(id);
  }
  function loadEnd(p, v, e, key) {
    if (pr === p) {
      pr = null;
      if (initP && p === initP && options.onHydrated) options.onHydrated(key, {
        value: v
      });
      initP = null;
      setError(err = e);
      if (Transition && p && loadedUnderTransition) {
        Transition.promises.delete(p);
        loadedUnderTransition = false;
        runUpdates(() => {
          Transition.running = true;
          if (!Transition.promises.size) {
            Effects.push.apply(Effects, Transition.effects);
            Transition.effects = [];
          }
          completeLoad(v);
        }, false);
      } else completeLoad(v);
    }
    return v;
  }
  function completeLoad(v) {
    batch(() => {
      set(() => v);
      setLoading(false);
      for (const c of contexts.keys()) c.decrement();
      contexts.clear();
    });
  }
  function read() {
    const c = SuspenseContext && lookup(Owner, SuspenseContext.id),
          v = s();
    if (err) throw err;
    if (Listener && !Listener.user && c) {
      createComputed(() => {
        track();
        if (pr) {
          if (c.resolved && Transition) Transition.promises.add(pr);else if (!contexts.has(c)) {
            c.increment();
            contexts.add(c);
          }
        }
      });
    }
    return v;
  }
  function load(refetching = true) {
    if (refetching && scheduled) return;
    scheduled = false;
    setError(err = undefined);
    const lookup = dynamic ? source() : source;
    loadedUnderTransition = Transition && Transition.running;
    if (lookup == null || lookup === false) {
      loadEnd(pr, untrack(s));
      return;
    }
    if (Transition && pr) Transition.promises.delete(pr);
    const p = initP || untrack(() => fetcher(lookup, {
      value: s(),
      refetching
    }));
    if (typeof p !== "object" || !("then" in p)) {
      loadEnd(pr, p);
      return p;
    }
    pr = p;
    scheduled = true;
    queueMicrotask(() => scheduled = false);
    batch(() => {
      setLoading(true);
      trigger();
    });
    return p.then(v => loadEnd(p, v, undefined, lookup), e => loadEnd(p, e, e));
  }
  Object.defineProperties(read, {
    loading: {
      get() {
        return loading();
      }
    },
    error: {
      get() {
        return error();
      }
    }
  });
  if (dynamic) createComputed(() => load(false));else load(false);
  return [read, {
    refetch: load,
    mutate: set
  }];
}
let Resources;
function refetchResources(info) {
  return Resources && Promise.all([...Resources].map(fn => fn(info)));
}
function createDeferred(source, options) {
  let t,
      timeout = options ? options.timeoutMs : undefined;
  const node = createComputation(() => {
    if (!t || !t.fn) t = requestCallback(() => setDeferred(() => node.value), timeout !== undefined ? {
      timeout
    } : undefined);
    return source();
  }, undefined, true);
  const [deferred, setDeferred] = createSignal(node.value, options);
  updateComputation(node);
  setDeferred(() => node.value);
  return deferred;
}
function createSelector(source, fn = equalFn, options) {
  const subs = new Map();
  const node = createComputation(p => {
    const v = source();
    for (const key of subs.keys()) if (fn(key, v) !== (p !== undefined && fn(key, p))) {
      const l = subs.get(key);
      for (const c of l.values()) {
        c.state = STALE;
        if (c.pure) Updates.push(c);else Effects.push(c);
      }
    }
    return v;
  }, undefined, true, STALE, options );
  updateComputation(node);
  return key => {
    let listener;
    if (listener = Listener) {
      let l;
      if (l = subs.get(key)) l.add(listener);else subs.set(key, l = new Set([listener]));
      onCleanup(() => {
        l.delete(listener);
        !l.size && subs.delete(key);
      });
    }
    return fn(key, Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value);
  };
}
function batch(fn) {
  if (Pending) return fn();
  let result;
  const q = Pending = [];
  try {
    result = fn();
  } finally {
    Pending = null;
  }
  runUpdates(() => {
    for (let i = 0; i < q.length; i += 1) {
      const data = q[i];
      if (data.pending !== NOTPENDING) {
        const pending = data.pending;
        data.pending = NOTPENDING;
        writeSignal(data, pending);
      }
    }
  }, false);
  return result;
}
function untrack(fn) {
  let result,
      listener = Listener;
  Listener = null;
  result = fn();
  Listener = listener;
  return result;
}
function on(deps, fn,
options) {
  const isArray = Array.isArray(deps);
  let prevInput;
  let defer = options && options.defer;
  return prevValue => {
    let input;
    if (isArray) {
      input = [];
      for (let i = 0; i < deps.length; i++) input.push(deps[i]());
    } else input = deps();
    if (defer) {
      defer = false;
      return undefined;
    }
    const result = untrack(() => fn(input, prevInput, prevValue));
    prevInput = input;
    return result;
  };
}
function onMount(fn) {
  createEffect(() => untrack(fn));
}
function onCleanup(fn) {
  if (Owner === null) console.warn("cleanups created outside a `createRoot` or `render` will never be run");else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
  return fn;
}
function onError(fn) {
  ERROR || (ERROR = Symbol("error"));
  if (Owner === null) console.warn("error handlers created outside a `createRoot` or `render` will never be run");else if (Owner.context === null) Owner.context = {
    [ERROR]: [fn]
  };else if (!Owner.context[ERROR]) Owner.context[ERROR] = [fn];else Owner.context[ERROR].push(fn);
}
function getListener() {
  return Listener;
}
function getOwner() {
  return Owner;
}
function runWithOwner(o, fn) {
  const prev = Owner;
  Owner = o;
  try {
    return runUpdates(fn, true);
  } finally {
    Owner = prev;
  }
}
function enableScheduling(scheduler = requestCallback) {
  Scheduler = scheduler;
}
function startTransition(fn) {
  if (Transition && Transition.running) {
    fn();
    return Transition.done;
  }
  const l = Listener;
  const o = Owner;
  return Promise.resolve().then(() => {
    Listener = l;
    Owner = o;
    let t;
    if (Scheduler || SuspenseContext) {
      t = Transition || (Transition = {
        sources: new Set(),
        effects: [],
        promises: new Set(),
        disposed: new Set(),
        queue: new Set(),
        running: true
      });
      t.done || (t.done = new Promise(res => t.resolve = res));
      t.running = true;
    }
    batch(fn);
    return t ? t.done : undefined;
  });
}
function useTransition() {
  return [transPending, startTransition];
}
function resumeEffects(e) {
  Effects.push.apply(Effects, e);
  e.length = 0;
}
function devComponent(Comp, props) {
  const c = createComputation(() => untrack(() => {
    Object.assign(Comp, {
      [$DEVCOMP]: true
    });
    return Comp(props);
  }), undefined, true);
  c.pending = NOTPENDING;
  c.observers = null;
  c.observerSlots = null;
  c.state = 0;
  c.componentName = Comp.name;
  updateComputation(c);
  return c.tValue !== undefined ? c.tValue : c.value;
}
function hashValue(v) {
  const s = new Set();
  return `s${typeof v === "string" ? hash(v) : hash(JSON.stringify(v, (k, v) => {
    if (typeof v === "object" && v != null) {
      if (s.has(v)) return;
      s.add(v);
      const keys = Object.keys(v);
      const desc = Object.getOwnPropertyDescriptors(v);
      const newDesc = keys.reduce((memo, key) => {
        const value = desc[key];
        if (!value.get) memo[key] = value;
        return memo;
      }, {});
      v = Object.create({}, newDesc);
    }
    if (typeof v === "bigint") {
      return `${v.toString()}n`;
    }
    return v;
  }) || "")}`;
}
function registerGraph(name, value) {
  let tryName = name;
  if (Owner) {
    let i = 0;
    Owner.sourceMap || (Owner.sourceMap = {});
    while (Owner.sourceMap[tryName]) tryName = `${name}-${++i}`;
    Owner.sourceMap[tryName] = value;
  }
  return tryName;
}
function serializeGraph(owner) {
  owner || (owner = Owner);
  if (!owner) return {};
  return { ...serializeValues(owner.sourceMap),
    ...(owner.owned ? serializeChildren(owner) : {})
  };
}
function createContext(defaultValue) {
  const id = Symbol("context");
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
function useContext(context) {
  let ctx;
  return (ctx = lookup(Owner, context.id)) !== undefined ? ctx : context.defaultValue;
}
function children(fn) {
  const children = createMemo(fn);
  return createMemo(() => resolveChildren(children()));
}
let SuspenseContext;
function getSuspenseContext() {
  return SuspenseContext || (SuspenseContext = createContext({}));
}
function enableExternalSource(factory) {
  if (ExternalSourceFactory) {
    const oldFactory = ExternalSourceFactory;
    ExternalSourceFactory = (fn, trigger) => {
      const oldSource = oldFactory(fn, trigger);
      const source = factory(x => oldSource.track(x), trigger);
      return {
        track: x => source.track(x),
        dispose() {
          source.dispose();
          oldSource.dispose();
        }
      };
    };
  } else {
    ExternalSourceFactory = factory;
  }
}
function readSignal() {
  const runningTransition = Transition && Transition.running;
  if (this.sources && (!runningTransition && this.state || runningTransition && this.tState)) {
    const updates = Updates;
    Updates = null;
    !runningTransition && this.state === STALE || runningTransition && this.tState === STALE ? updateComputation(this) : lookDownstream(this);
    Updates = updates;
  }
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  if (runningTransition && Transition.sources.has(this)) return this.tValue;
  return this.value;
}
function writeSignal(node, value, isComp) {
  if (Pending) {
    if (node.pending === NOTPENDING) Pending.push(node);
    node.pending = value;
    return value;
  }
  if (node.comparator) {
    if (Transition && Transition.running && Transition.sources.has(node)) {
      if (node.comparator(node.tValue, value)) return value;
    } else if (node.comparator(node.value, value)) return value;
  }
  let TransitionRunning = false;
  if (Transition) {
    TransitionRunning = Transition.running;
    if (TransitionRunning || !isComp && Transition.sources.has(node)) {
      Transition.sources.add(node);
      node.tValue = value;
    }
    if (!TransitionRunning) node.value = value;
  } else node.value = value;
  if (node.observers && node.observers.length) {
    runUpdates(() => {
      for (let i = 0; i < node.observers.length; i += 1) {
        const o = node.observers[i];
        if (TransitionRunning && Transition.disposed.has(o)) continue;
        if (TransitionRunning && !o.tState || !TransitionRunning && !o.state) {
          if (o.pure) Updates.push(o);else Effects.push(o);
          if (o.observers) markUpstream(o);
        }
        if (TransitionRunning) o.tState = STALE;else o.state = STALE;
      }
      if (Updates.length > 10e5) {
        Updates = [];
        if (true) throw new Error("Potential Infinite Loop Detected.");
        throw new Error();
      }
    }, false);
  }
  return value;
}
function updateComputation(node) {
  if (!node.fn) return;
  cleanNode(node);
  const owner = Owner,
        listener = Listener,
        time = ExecCount;
  Listener = Owner = node;
  runComputation(node, Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value, time);
  if (Transition && !Transition.running && Transition.sources.has(node)) {
    queueMicrotask(() => {
      runUpdates(() => {
        Transition && (Transition.running = true);
        runComputation(node, node.tValue, time);
      }, false);
    });
  }
  Listener = listener;
  Owner = owner;
}
function runComputation(node, value, time) {
  let nextValue;
  try {
    nextValue = node.fn(value);
  } catch (err) {
    handleError(err);
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.observers && node.observers.length) {
      writeSignal(node, nextValue, true);
    } else if (Transition && Transition.running && node.pure) {
      Transition.sources.add(node);
      node.tValue = nextValue;
    } else node.value = nextValue;
    node.updatedAt = time;
  }
}
function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state: state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: null,
    pure
  };
  if (Transition && Transition.running) {
    c.state = 0;
    c.tState = state;
  }
  if (Owner === null) console.warn("computations created outside a `createRoot` or `render` will never be disposed");else if (Owner !== UNOWNED) {
    if (Transition && Transition.running && Owner.pure) {
      if (!Owner.tOwned) Owner.tOwned = [c];else Owner.tOwned.push(c);
    } else {
      if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
    }
    c.name = options && options.name || `${Owner.name || "c"}-${(Owner.owned || Owner.tOwned).length}`;
  }
  if (ExternalSourceFactory) {
    const [track, trigger] = createSignal(undefined, {
      equals: false
    });
    const ordinary = ExternalSourceFactory(c.fn, trigger);
    onCleanup(() => ordinary.dispose());
    const triggerInTransition = () => startTransition(trigger).then(() => inTransition.dispose());
    const inTransition = ExternalSourceFactory(c.fn, triggerInTransition);
    c.fn = x => {
      track();
      return Transition && Transition.running ? inTransition.track(x) : ordinary.track(x);
    };
  }
  return c;
}
function runTop(node) {
  const runningTransition = Transition && Transition.running;
  if (!runningTransition && node.state === 0 || runningTransition && node.tState === 0) return;
  if (!runningTransition && node.state === PENDING || runningTransition && node.tState === PENDING) return lookDownstream(node);
  if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (runningTransition && Transition.disposed.has(node)) return;
    if (!runningTransition && node.state || runningTransition && node.tState) ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if (runningTransition) {
      let top = node,
          prev = ancestors[i + 1];
      while ((top = top.owner) && top !== prev) {
        if (Transition.disposed.has(top)) return;
      }
    }
    if (!runningTransition && node.state === STALE || runningTransition && node.tState === STALE) {
      updateComputation(node);
    } else if (!runningTransition && node.state === PENDING || runningTransition && node.tState === PENDING) {
      const updates = Updates;
      Updates = null;
      lookDownstream(node, ancestors[0]);
      Updates = updates;
    }
  }
}
function runUpdates(fn, init) {
  if (Updates) return fn();
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true;else Effects = [];
  ExecCount++;
  try {
    return fn();
  } catch (err) {
    handleError(err);
  } finally {
    completeUpdates(wait);
  }
}
function completeUpdates(wait) {
  if (Updates) {
    if (Scheduler && Transition && Transition.running) scheduleQueue(Updates);else runQueue(Updates);
    Updates = null;
  }
  if (wait) return;
  let res;
  if (Transition && Transition.running) {
    if (Transition.promises.size || Transition.queue.size) {
      Transition.running = false;
      Transition.effects.push.apply(Transition.effects, Effects);
      Effects = null;
      setTransPending(true);
      return;
    }
    const sources = Transition.sources;
    res = Transition.resolve;
    Effects.forEach(e => {
      "tState" in e && (e.state = e.tState);
      delete e.tState;
    });
    Transition = null;
    batch(() => {
      sources.forEach(v => {
        v.value = v.tValue;
        if (v.owned) {
          for (let i = 0, len = v.owned.length; i < len; i++) cleanNode(v.owned[i]);
        }
        if (v.tOwned) v.owned = v.tOwned;
        delete v.tValue;
        delete v.tOwned;
        v.tState = 0;
      });
      setTransPending(false);
    });
  }
  if (Effects.length) batch(() => {
    runEffects(Effects);
    Effects = null;
  });else {
    Effects = null;
    globalThis._$afterUpdate && globalThis._$afterUpdate();
  }
  if (res) res();
}
function runQueue(queue) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}
function scheduleQueue(queue) {
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const tasks = Transition.queue;
    if (!tasks.has(item)) {
      tasks.add(item);
      Scheduler(() => {
        tasks.delete(item);
        runUpdates(() => {
          Transition.running = true;
          runTop(item);
          if (!tasks.size) {
            Effects.push.apply(Effects, Transition.effects);
            Transition.effects = [];
          }
        }, false);
        Transition && (Transition.running = false);
      });
    }
  }
}
function runUserEffects(queue) {
  let i,
      userLength = 0;
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (!e.user) runTop(e);else queue[userLength++] = e;
  }
  const resume = queue.length;
  for (i = 0; i < userLength; i++) runTop(queue[i]);
  for (i = resume; i < queue.length; i++) runTop(queue[i]);
}
function lookDownstream(node, ignore) {
  const runningTransition = Transition && Transition.running;
  if (runningTransition) node.tState = 0;else node.state = 0;
  for (let i = 0; i < node.sources.length; i += 1) {
    const source = node.sources[i];
    if (source.sources) {
      if (!runningTransition && source.state === STALE || runningTransition && source.tState === STALE) {
        if (source !== ignore) runTop(source);
      } else if (!runningTransition && source.state === PENDING || runningTransition && source.tState === PENDING) lookDownstream(source, ignore);
    }
  }
}
function markUpstream(node) {
  const runningTransition = Transition && Transition.running;
  for (let i = 0; i < node.observers.length; i += 1) {
    const o = node.observers[i];
    if (!runningTransition && !o.state || runningTransition && !o.tState) {
      if (runningTransition) o.tState = PENDING;else o.state = PENDING;
      if (o.pure) Updates.push(o);else Effects.push(o);
      o.observers && markUpstream(o);
    }
  }
}
function cleanNode(node) {
  let i;
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(),
            index = node.sourceSlots.pop(),
            obs = source.observers;
      if (obs && obs.length) {
        const n = obs.pop(),
              s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
  if (Transition && Transition.running && node.pure) {
    if (node.tOwned) {
      for (i = 0; i < node.tOwned.length; i++) cleanNode(node.tOwned[i]);
      delete node.tOwned;
    }
    reset(node, true);
  } else if (node.owned) {
    for (i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
    node.cleanups = null;
  }
  if (Transition && Transition.running) node.tState = 0;else node.state = 0;
  node.context = null;
}
function reset(node, top) {
  if (!top) {
    node.tState = 0;
    Transition.disposed.add(node);
  }
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) reset(node.owned[i]);
  }
}
function handleError(err) {
  const fns = ERROR && lookup(Owner, ERROR);
  if (!fns) throw err;
  fns.forEach(f => f(err));
}
function lookup(owner, key) {
  return owner ? owner.context && owner.context[key] !== undefined ? owner.context[key] : lookup(owner.owner, key) : undefined;
}
function resolveChildren(children) {
  if (typeof children === "function" && !children.length) return resolveChildren(children());
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}
function createProvider(id) {
  return function provider(props) {
    let res;
    createComputed(() => res = untrack(() => {
      Owner.context = {
        [id]: props.value
      };
      return children(() => props.children);
    }));
    return res;
  };
}
function hash(s) {
  for (var i = 0, h = 9; i < s.length;) h = Math.imul(h ^ s.charCodeAt(i++), 9 ** 9);
  return `${h ^ h >>> 9}`;
}
function serializeValues(sources = {}) {
  const k = Object.keys(sources);
  const result = {};
  for (let i = 0; i < k.length; i++) {
    const key = k[i];
    result[key] = sources[key].value;
  }
  return result;
}
function serializeChildren(root) {
  const result = {};
  for (let i = 0, len = root.owned.length; i < len; i++) {
    const node = root.owned[i];
    result[node.componentName ? `${node.componentName}:${node.name}` : node.name] = { ...serializeValues(node.sourceMap),
      ...(node.owned ? serializeChildren(node) : {})
    };
  }
  return result;
}

function getSymbol() {
  const SymbolCopy = Symbol;
  return SymbolCopy.observable || "@@observable";
}
function observable(input) {
  const $$observable = getSymbol();
  return {
    subscribe(observer) {
      if (!(observer instanceof Object) || observer == null) {
        throw new TypeError("Expected the observer to be an object.");
      }
      const handler = "next" in observer ? observer.next.bind(observer) : observer;
      let complete = false;
      createComputed(() => {
        if (complete) return;
        const v = input();
        untrack(() => handler(v));
      });
      return {
        unsubscribe() {
          complete = true;
        }
      };
    },
    [$$observable]() {
      return this;
    }
  };
}
function from(producer) {
  const [s, set] = createSignal(undefined, {
    equals: false
  });
  if ("subscribe" in producer) {
    const unsub = producer.subscribe(v => set(() => v));
    onCleanup(() => "unsubscribe" in unsub ? unsub.unsubscribe() : unsub());
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  return s;
}

const FALLBACK = Symbol("fallback");
function dispose(d) {
  for (let i = 0; i < d.length; i++) d[i]();
}
function mapArray(list, mapFn, options = {}) {
  let items = [],
      mapped = [],
      disposers = [],
      len = 0,
      indexes = mapFn.length > 1 ? [] : null;
  onCleanup(() => dispose(disposers));
  return () => {
    let newItems = list() || [],
        i,
        j;
    return untrack(() => {
      let newLen = newItems.length,
          newIndices,
          newIndicesNext,
          temp,
          tempdisposers,
          tempIndexes,
          start,
          end,
          newEnd,
          item;
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          indexes && (indexes = []);
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer;
            return options.fallback();
          });
          len = 1;
        }
      }
      else if (len === 0) {
        mapped = new Array(newLen);
        for (j = 0; j < newLen; j++) {
          items[j] = newItems[j];
          mapped[j] = createRoot(mapper);
        }
        len = newLen;
      } else {
        temp = new Array(newLen);
        tempdisposers = new Array(newLen);
        indexes && (tempIndexes = new Array(newLen));
        for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
        for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
          temp[newEnd] = mapped[end];
          tempdisposers[newEnd] = disposers[end];
          indexes && (tempIndexes[newEnd] = indexes[end]);
        }
        newIndices = new Map();
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = newItems[j];
          i = newIndices.get(item);
          newIndicesNext[j] = i === undefined ? -1 : i;
          newIndices.set(item, j);
        }
        for (i = start; i <= end; i++) {
          item = items[i];
          j = newIndices.get(item);
          if (j !== undefined && j !== -1) {
            temp[j] = mapped[i];
            tempdisposers[j] = disposers[i];
            indexes && (tempIndexes[j] = indexes[i]);
            j = newIndicesNext[j];
            newIndices.set(item, j);
          } else disposers[i]();
        }
        for (j = start; j < newLen; j++) {
          if (j in temp) {
            mapped[j] = temp[j];
            disposers[j] = tempdisposers[j];
            if (indexes) {
              indexes[j] = tempIndexes[j];
              indexes[j](j);
            }
          } else mapped[j] = createRoot(mapper);
        }
        mapped = mapped.slice(0, len = newLen);
        items = newItems.slice(0);
      }
      return mapped;
    });
    function mapper(disposer) {
      disposers[j] = disposer;
      if (indexes) {
        const [s, set] = createSignal(j);
        indexes[j] = set;
        return mapFn(newItems[j], s);
      }
      return mapFn(newItems[j]);
    }
  };
}
function indexArray(list, mapFn, options = {}) {
  let items = [],
      mapped = [],
      disposers = [],
      signals = [],
      len = 0,
      i;
  onCleanup(() => dispose(disposers));
  return () => {
    const newItems = list() || [];
    return untrack(() => {
      if (newItems.length === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          signals = [];
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer;
            return options.fallback();
          });
          len = 1;
        }
        return mapped;
      }
      if (items[0] === FALLBACK) {
        disposers[0]();
        disposers = [];
        items = [];
        mapped = [];
        len = 0;
      }
      for (i = 0; i < newItems.length; i++) {
        if (i < items.length && items[i] !== newItems[i]) {
          signals[i](() => newItems[i]);
        } else if (i >= items.length) {
          mapped[i] = createRoot(mapper);
        }
      }
      for (; i < items.length; i++) {
        disposers[i]();
      }
      len = signals.length = disposers.length = newItems.length;
      items = newItems.slice(0);
      return mapped = mapped.slice(0, len);
    });
    function mapper(disposer) {
      disposers[i] = disposer;
      const [s, set] = createSignal(newItems[i]);
      signals[i] = set;
      return mapFn(s, i);
    }
  };
}

let hydrationEnabled = false;
function enableHydration() {
  hydrationEnabled = true;
}
function createComponent(Comp, props) {
  if (hydrationEnabled) {
    if (sharedConfig.context) {
      const c = sharedConfig.context;
      setHydrateContext(nextHydrateContext());
      const r = devComponent(Comp, props) ;
      setHydrateContext(c);
      return r;
    }
  }
  return devComponent(Comp, props);
}
function trueFn() {
  return true;
}
const propTraps = {
  get(_, property, receiver) {
    if (property === $PROXY) return receiver;
    return _.get(property);
  },
  has(_, property) {
    return _.has(property);
  },
  set: trueFn,
  deleteProperty: trueFn,
  getOwnPropertyDescriptor(_, property) {
    return {
      configurable: true,
      enumerable: true,
      get() {
        return _.get(property);
      },
      set: trueFn,
      deleteProperty: trueFn
    };
  },
  ownKeys(_) {
    return _.keys();
  }
};
function resolveSource(s) {
  return typeof s === "function" ? s() : s;
}
function mergeProps(...sources) {
  return new Proxy({
    get(property) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const v = resolveSource(sources[i])[property];
        if (v !== undefined) return v;
      }
    },
    has(property) {
      for (let i = sources.length - 1; i >= 0; i--) {
        if (property in resolveSource(sources[i])) return true;
      }
      return false;
    },
    keys() {
      const keys = [];
      for (let i = 0; i < sources.length; i++) keys.push(...Object.keys(resolveSource(sources[i])));
      return [...new Set(keys)];
    }
  }, propTraps);
}
function splitProps(props, ...keys) {
  const blocked = new Set(keys.flat());
  const descriptors = Object.getOwnPropertyDescriptors(props);
  const res = keys.map(k => {
    const clone = {};
    for (let i = 0; i < k.length; i++) {
      const key = k[i];
      Object.defineProperty(clone, key, descriptors[key] ? descriptors[key] : {
        get() {
          return props[key];
        },
        set() {
          return true;
        }
      });
    }
    return clone;
  });
  res.push(new Proxy({
    get(property) {
      return blocked.has(property) ? undefined : props[property];
    },
    has(property) {
      return blocked.has(property) ? false : property in props;
    },
    keys() {
      return Object.keys(props).filter(k => !blocked.has(k));
    }
  }, propTraps));
  return res;
}
function lazy(fn) {
  let comp;
  let p;
  const wrap = props => {
    const ctx = sharedConfig.context;
    if (ctx) {
      const [s, set] = createSignal();
      (p || (p = fn())).then(mod => {
        setHydrateContext(ctx);
        set(() => mod.default);
        setHydrateContext();
      });
      comp = s;
    } else if (!comp) {
      const [s] = createResource(() => (p || (p = fn())).then(mod => mod.default), {
        globalRefetch: false
      });
      comp = s;
    } else {
      const c = comp();
      if (c) return c(props);
    }
    let Comp;
    return createMemo(() => (Comp = comp()) && untrack(() => {
      Object.assign(Comp, {
        [$DEVCOMP]: true
      });
      if (!ctx) return Comp(props);
      const c = sharedConfig.context;
      setHydrateContext(ctx);
      const r = Comp(props);
      setHydrateContext(c);
      return r;
    }));
  };
  wrap.preload = () => p || ((p = fn()).then(mod => comp = () => mod.default), p);
  return wrap;
}
let counter = 0;
function createUniqueId() {
  const ctx = sharedConfig.context;
  return ctx ? `${ctx.id}${ctx.count++}` : `cl-${counter++}`;
}

function For(props) {
  const fallback = "fallback" in props && {
    fallback: () => props.fallback
  };
  return createMemo(mapArray(() => props.each, props.children, fallback ? fallback : undefined));
}
function Index(props) {
  const fallback = "fallback" in props && {
    fallback: () => props.fallback
  };
  return createMemo(indexArray(() => props.each, props.children, fallback ? fallback : undefined));
}
function Show(props) {
  let strictEqual = false;
  const condition = createMemo(() => props.when, undefined, {
    equals: (a, b) => strictEqual ? a === b : !a === !b
  });
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      return (strictEqual = typeof child === "function" && child.length > 0) ? untrack(() => child(c)) : child;
    }
    return props.fallback;
  });
}
function Switch(props) {
  let strictEqual = false;
  const conditions = children(() => props.children),
        evalConditions = createMemo(() => {
    let conds = conditions();
    if (!Array.isArray(conds)) conds = [conds];
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i].when;
      if (c) return [i, c, conds[i]];
    }
    return [-1];
  }, undefined, {
    equals: (a, b) => a[0] === b[0] && (strictEqual ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2]
  });
  return createMemo(() => {
    const [index, when, cond] = evalConditions();
    if (index < 0) return props.fallback;
    const c = cond.children;
    return (strictEqual = typeof c === "function" && c.length > 0) ? untrack(() => c(when)) : c;
  });
}
function Match(props) {
  return props;
}
let Errors;
function resetErrorBoundaries() {
  Errors && [...Errors].forEach(fn => fn());
}
function ErrorBoundary(props) {
  let err = undefined;
  if (sharedConfig.context && sharedConfig.load) {
    err = sharedConfig.load(sharedConfig.context.id + sharedConfig.context.count);
  }
  const [errored, setErrored] = createSignal(err);
  Errors || (Errors = new Set());
  Errors.add(setErrored);
  onCleanup(() => Errors.delete(setErrored));
  let e;
  return createMemo(() => {
    if ((e = errored()) != null) {
      const f = props.fallback;
      return typeof f === "function" && f.length ? untrack(() => f(e, () => setErrored(null))) : f;
    }
    onError(setErrored);
    return props.children;
  });
}

const SuspenseListContext = createContext();
function SuspenseList(props) {
  let index = 0,
      suspenseSetter,
      showContent,
      showFallback;
  const listContext = useContext(SuspenseListContext);
  if (listContext) {
    const [inFallback, setFallback] = createSignal(false);
    suspenseSetter = setFallback;
    [showContent, showFallback] = listContext.register(inFallback);
  }
  const registry = [],
        comp = createComponent(SuspenseListContext.Provider, {
    value: {
      register: inFallback => {
        const [showingContent, showContent] = createSignal(false),
              [showingFallback, showFallback] = createSignal(false);
        registry[index++] = {
          inFallback,
          showContent,
          showFallback
        };
        return [showingContent, showingFallback];
      }
    },
    get children() {
      return props.children;
    }
  });
  createComputed(() => {
    const reveal = props.revealOrder,
          tail = props.tail,
          visibleContent = showContent ? showContent() : true,
          visibleFallback = showFallback ? showFallback() : true,
          reverse = reveal === "backwards";
    if (reveal === "together") {
      const all = registry.every(i => !i.inFallback());
      suspenseSetter && suspenseSetter(!all);
      registry.forEach(i => {
        i.showContent(all && visibleContent);
        i.showFallback(visibleFallback);
      });
      return;
    }
    let stop = false;
    for (let i = 0, len = registry.length; i < len; i++) {
      const n = reverse ? len - i - 1 : i,
            s = registry[n].inFallback();
      if (!stop && !s) {
        registry[n].showContent(visibleContent);
        registry[n].showFallback(visibleFallback);
      } else {
        const next = !stop;
        if (next && suspenseSetter) suspenseSetter(true);
        if (!tail || next && tail === "collapsed") {
          registry[n].showFallback(visibleFallback);
        } else registry[n].showFallback(false);
        stop = true;
        registry[n].showContent(next);
      }
    }
    if (!stop && suspenseSetter) suspenseSetter(false);
  });
  return comp;
}
function Suspense(props) {
  let counter = 0,
      showContent,
      showFallback,
      ctx,
      p,
      flicker,
      error;
  const [inFallback, setFallback] = createSignal(false),
        SuspenseContext = getSuspenseContext(),
        store = {
    increment: () => {
      if (++counter === 1) setFallback(true);
    },
    decrement: () => {
      if (--counter === 0) setFallback(false);
    },
    inFallback,
    effects: [],
    resolved: false
  },
        owner = getOwner();
  if (sharedConfig.context) {
    const key = sharedConfig.context.id + sharedConfig.context.count;
    p = sharedConfig.load(key);
    if (p) {
      if (typeof p !== "object" || !("then" in p)) p = Promise.resolve(p);
      const [s, set] = createSignal(undefined, {
        equals: false
      });
      flicker = s;
      p.then(err => {
        if (error = err) return set();
        sharedConfig.gather(key);
        setHydrateContext(ctx);
        set();
        setHydrateContext();
      });
    }
  }
  const listContext = useContext(SuspenseListContext);
  if (listContext) [showContent, showFallback] = listContext.register(store.inFallback);
  let dispose;
  onCleanup(() => dispose && dispose());
  return createComponent(SuspenseContext.Provider, {
    value: store,
    get children() {
      return createMemo(() => {
        if (error) throw error;
        ctx = sharedConfig.context;
        if (flicker) {
          flicker();
          return flicker = undefined;
        }
        if (ctx && p === undefined) setHydrateContext();
        const rendered = untrack(() => props.children);
        return createMemo(() => {
          const inFallback = store.inFallback(),
                visibleContent = showContent ? showContent() : true,
                visibleFallback = showFallback ? showFallback() : true;
          dispose && dispose();
          if ((!inFallback || p !== undefined) && visibleContent) {
            store.resolved = true;
            ctx = p = undefined;
            resumeEffects(store.effects);
            return rendered;
          }
          if (!visibleFallback) return;
          return createRoot(disposer => {
            dispose = disposer;
            if (ctx) {
              setHydrateContext({
                id: ctx.id + "f",
                count: 0
              });
              ctx = undefined;
            }
            return props.fallback;
          }, owner);
        });
      });
    }
  });
}

let DEV;
{
  DEV = {
    writeSignal,
    serializeGraph,
    registerGraph,
    hashValue
  };
}
if (globalThis) {
  if (!globalThis.Solid$$) globalThis.Solid$$ = true;else console.warn("You appear to have multiple instances of Solid. This can lead to unexpected behavior.");
}




/***/ }),

/***/ "./node_modules/solid-js/web/dist/dev.js":
/*!***********************************************!*\
  !*** ./node_modules/solid-js/web/dist/dev.js ***!
  \***********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Aliases": () => (/* binding */ Aliases),
/* harmony export */   "Assets": () => (/* binding */ Assets),
/* harmony export */   "ChildProperties": () => (/* binding */ ChildProperties),
/* harmony export */   "DelegatedEvents": () => (/* binding */ DelegatedEvents),
/* harmony export */   "Dynamic": () => (/* binding */ Dynamic),
/* harmony export */   "ErrorBoundary": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.ErrorBoundary),
/* harmony export */   "For": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.For),
/* harmony export */   "HydrationScript": () => (/* binding */ Assets),
/* harmony export */   "Index": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.Index),
/* harmony export */   "Match": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.Match),
/* harmony export */   "NoHydration": () => (/* binding */ NoHydration),
/* harmony export */   "Portal": () => (/* binding */ Portal),
/* harmony export */   "PropAliases": () => (/* binding */ PropAliases),
/* harmony export */   "Properties": () => (/* binding */ Properties),
/* harmony export */   "SVGElements": () => (/* binding */ SVGElements),
/* harmony export */   "SVGNamespace": () => (/* binding */ SVGNamespace),
/* harmony export */   "Show": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.Show),
/* harmony export */   "Suspense": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.Suspense),
/* harmony export */   "SuspenseList": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.SuspenseList),
/* harmony export */   "Switch": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.Switch),
/* harmony export */   "addEventListener": () => (/* binding */ addEventListener),
/* harmony export */   "assign": () => (/* binding */ assign),
/* harmony export */   "classList": () => (/* binding */ classList),
/* harmony export */   "clearDelegatedEvents": () => (/* binding */ clearDelegatedEvents),
/* harmony export */   "createComponent": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.createComponent),
/* harmony export */   "delegateEvents": () => (/* binding */ delegateEvents),
/* harmony export */   "dynamicProperty": () => (/* binding */ dynamicProperty),
/* harmony export */   "effect": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect),
/* harmony export */   "escape": () => (/* binding */ escape),
/* harmony export */   "generateHydrationScript": () => (/* binding */ generateHydrationScript),
/* harmony export */   "getHydrationKey": () => (/* binding */ getHydrationKey),
/* harmony export */   "getNextElement": () => (/* binding */ getNextElement),
/* harmony export */   "getNextMarker": () => (/* binding */ getNextMarker),
/* harmony export */   "getNextMatch": () => (/* binding */ getNextMatch),
/* harmony export */   "getOwner": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.getOwner),
/* harmony export */   "hydrate": () => (/* binding */ hydrate),
/* harmony export */   "innerHTML": () => (/* binding */ innerHTML),
/* harmony export */   "insert": () => (/* binding */ insert),
/* harmony export */   "isServer": () => (/* binding */ isServer),
/* harmony export */   "memo": () => (/* binding */ memo),
/* harmony export */   "mergeProps": () => (/* reexport safe */ solid_js__WEBPACK_IMPORTED_MODULE_0__.mergeProps),
/* harmony export */   "render": () => (/* binding */ render),
/* harmony export */   "renderToStream": () => (/* binding */ renderToStream),
/* harmony export */   "renderToString": () => (/* binding */ renderToString),
/* harmony export */   "renderToStringAsync": () => (/* binding */ renderToStringAsync),
/* harmony export */   "resolveSSRNode": () => (/* binding */ resolveSSRNode),
/* harmony export */   "runHydrationEvents": () => (/* binding */ runHydrationEvents),
/* harmony export */   "setAttribute": () => (/* binding */ setAttribute),
/* harmony export */   "setAttributeNS": () => (/* binding */ setAttributeNS),
/* harmony export */   "spread": () => (/* binding */ spread),
/* harmony export */   "ssr": () => (/* binding */ ssr),
/* harmony export */   "ssrBoolean": () => (/* binding */ ssrBoolean),
/* harmony export */   "ssrClassList": () => (/* binding */ ssrClassList),
/* harmony export */   "ssrHydrationKey": () => (/* binding */ ssrHydrationKey),
/* harmony export */   "ssrSpread": () => (/* binding */ ssrSpread),
/* harmony export */   "ssrStyle": () => (/* binding */ ssrStyle),
/* harmony export */   "style": () => (/* binding */ style),
/* harmony export */   "template": () => (/* binding */ template)
/* harmony export */ });
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");



const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
const Properties = new Set(["className", "value", "readOnly", "formNoValidate", "isMap", "noModule", "playsInline", ...booleans]);
const ChildProperties = new Set(["innerHTML", "textContent", "innerText", "children"]);
const Aliases = {
  className: "class",
  htmlFor: "for"
};
const PropAliases = {
  class: "className",
  formnovalidate: "formNoValidate",
  ismap: "isMap",
  nomodule: "noModule",
  playsinline: "playsInline",
  readonly: "readOnly"
};
const DelegatedEvents = new Set(["beforeinput", "click", "dblclick", "contextmenu", "focusin", "focusout", "input", "keydown", "keyup", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup", "touchend", "touchmove", "touchstart"]);
const SVGElements = new Set([
"altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor", "animateMotion", "animateTransform", "circle", "clipPath", "color-profile", "cursor", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "font", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignObject", "g", "glyph", "glyphRef", "hkern", "image", "line", "linearGradient", "marker", "mask", "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect",
"set", "stop",
"svg", "switch", "symbol", "text", "textPath",
"tref", "tspan", "use", "view", "vkern"]);
const SVGNamespace = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace"
};

function memo(fn, equals) {
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createMemo)(fn, undefined, !equals ? {
    equals
  } : undefined);
}

function reconcileArrays(parentNode, a, b) {
  let bLength = b.length,
      aEnd = a.length,
      bEnd = bLength,
      aStart = 0,
      bStart = 0,
      after = a[aEnd - 1].nextSibling,
      map = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove();
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      if (!map) {
        map = new Map();
        let i = bStart;
        while (i < bEnd) map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart,
              sequence = 1,
              t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) parentNode.insertBefore(b[bStart++], node);
          } else parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else aStart++;
      } else a[aStart++].remove();
    }
  }
}

const $$EVENTS = "_$DX_DELEGATE";
function render(code, element, init) {
  let disposer;
  (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRoot)(dispose => {
    disposer = dispose;
    element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
  });
  return () => {
    disposer();
    element.textContent = "";
  };
}
function template(html, check, isSVG) {
  const t = document.createElement("template");
  t.innerHTML = html;
  if (check && t.innerHTML.split("<").length - 1 !== check) throw `The browser resolved template HTML does not match JSX input:\n${t.innerHTML}\n\n${html}. Is your HTML properly formed?`;
  let node = t.content.firstChild;
  if (isSVG) node = node.firstChild;
  return node;
}
function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}
function clearDelegatedEvents(document = window.document) {
  if (document[$$EVENTS]) {
    for (let name of document[$$EVENTS].keys()) document.removeEventListener(name, eventHandler);
    delete document[$$EVENTS];
  }
}
function setAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
}
function setAttributeNS(node, namespace, name, value) {
  if (value == null) node.removeAttributeNS(namespace, name);else node.setAttributeNS(namespace, name, value);
}
function addEventListener(node, name, handler, delegate) {
  if (delegate) {
    if (Array.isArray(handler)) {
      node[`$$${name}`] = handler[0];
      node[`$$${name}Data`] = handler[1];
    } else node[`$$${name}`] = handler;
  } else if (Array.isArray(handler)) {
    node.addEventListener(name, e => handler[0](handler[1], e));
  } else node.addEventListener(name, handler);
}
function classList(node, value, prev = {}) {
  const classKeys = Object.keys(value || {}),
        prevKeys = Object.keys(prev);
  let i, len;
  for (i = 0, len = prevKeys.length; i < len; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i],
          classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}
function style(node, value, prev = {}) {
  const nodeStyle = node.style;
  if (value == null || typeof value === "string") return nodeStyle.cssText = value;
  typeof prev === "string" && (prev = {});
  let v, s;
  for (s in prev) {
    value[s] == null && nodeStyle.removeProperty(s);
    delete prev[s];
  }
  for (s in value) {
    v = value[s];
    if (v !== prev[s]) {
      nodeStyle.setProperty(s, v);
      prev[s] = v;
    }
  }
  return prev;
}
function spread(node, accessor, isSVG, skipChildren) {
  if (typeof accessor === "function") {
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(current => spreadExpression(node, accessor(), current, isSVG, skipChildren));
  } else spreadExpression(node, accessor, undefined, isSVG, skipChildren);
}
function dynamicProperty(props, key) {
  const src = props[key];
  Object.defineProperty(props, key, {
    get() {
      return src();
    },
    enumerable: true
  });
  return props;
}
function innerHTML(parent, content) {
  !solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context && (parent.innerHTML = content);
}
function insert(parent, accessor, marker, initial) {
  if (marker !== undefined && !initial) initial = [];
  if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
  (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(current => insertExpression(parent, accessor(), current, marker), initial);
}
function assign(node, props, isSVG, skipChildren, prevProps = {}) {
  for (const prop in prevProps) {
    if (!(prop in props)) {
      if (prop === "children") continue;
      assignProp(node, prop, null, prevProps[prop], isSVG);
    }
  }
  for (const prop in props) {
    if (prop === "children") {
      if (!skipChildren) insertExpression(node, props.children);
      continue;
    }
    const value = props[prop];
    prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG);
  }
}
function hydrate$1(code, element, options = {}) {
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.completed = globalThis._$HY.completed;
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.events = globalThis._$HY.events;
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.load = globalThis._$HY.load;
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.gather = root => gatherHydratable(element, root);
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.registry = new Map();
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context = {
    id: options.renderId || "",
    count: 0
  };
  gatherHydratable(element, options.renderId);
  const dispose = render(code, element, [...element.childNodes]);
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context = null;
  return dispose;
}
function getNextElement(template) {
  let node, key;
  if (!solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context || !(node = solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.registry.get(key = getHydrationKey()))) {
    return template.cloneNode(true);
  }
  if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.completed) solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.completed.add(node);
  solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.registry["delete"](key);
  return node;
}
function getNextMatch(el, nodeName) {
  while (el && el.localName !== nodeName) el = el.nextSibling;
  return el;
}
function getNextMarker(start) {
  let end = start,
      count = 0,
      current = [];
  if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) {
    while (end) {
      if (end.nodeType === 8) {
        const v = end.nodeValue;
        if (v === "#") count++;else if (v === "/") {
          if (count === 0) return [end, current];
          count--;
        }
      }
      current.push(end);
      end = end.nextSibling;
    }
  }
  return [end, current];
}
function runHydrationEvents() {
  if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.events && !solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.events.queued) {
    queueMicrotask(() => {
      const {
        completed,
        events
      } = solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig;
      events.queued = false;
      while (events.length) {
        const [el, e] = events[0];
        if (!completed.has(el)) return;
        eventHandler(e);
        events.shift();
      }
    });
    solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.events.queued = true;
  }
}
function toPropertyName(name) {
  return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
}
function toggleClassKey(node, key, value) {
  const classNames = key.trim().split(/\s+/);
  for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
}
function assignProp(node, prop, value, prev, isSVG) {
  let isCE, isProp, isChildProp;
  if (prop === "style") return style(node, value, prev);
  if (prop === "classList") return classList(node, value, prev);
  if (value === prev) return prev;
  if (prop === "ref") {
    value(node);
  } else if (prop.slice(0, 3) === "on:") {
    node.addEventListener(prop.slice(3), value);
  } else if (prop.slice(0, 10) === "oncapture:") {
    node.addEventListener(prop.slice(10), value, true);
  } else if (prop.slice(0, 2) === "on") {
    const name = prop.slice(2).toLowerCase();
    const delegate = DelegatedEvents.has(name);
    addEventListener(node, name, value, delegate);
    delegate && delegateEvents([name]);
  } else if ((isChildProp = ChildProperties.has(prop)) || !isSVG && (PropAliases[prop] || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-"))) {
    if (isCE && !isProp && !isChildProp) node[toPropertyName(prop)] = value;else node[PropAliases[prop] || prop] = value;
  } else {
    const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
    if (ns) setAttributeNS(node, ns, prop, value);else setAttribute(node, Aliases[prop] || prop, value);
  }
  return value;
}
function eventHandler(e) {
  const key = `$$${e.type}`;
  let node = e.composedPath && e.composedPath()[0] || e.target;
  if (e.target !== node) {
    Object.defineProperty(e, "target", {
      configurable: true,
      value: node
    });
  }
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  while (node !== null) {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler(data, e) : handler(e);
      if (e.cancelBubble) return;
    }
    node = node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
  }
}
function spreadExpression(node, props, prevProps = {}, isSVG, skipChildren) {
  if (!skipChildren && "children" in props) {
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(() => prevProps.children = insertExpression(node, props.children, prevProps.children));
  }
  (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(() => assign(node, props, isSVG, true, prevProps));
  return prevProps;
}
function insertExpression(parent, value, current, marker, unwrapArray) {
  if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context && !current) current = [...parent.childNodes];
  while (typeof current === "function") current = current();
  if (value === current) return current;
  const t = typeof value,
        multi = marker !== undefined;
  parent = multi && current[0] && current[0].parentNode || parent;
  if (t === "string" || t === "number") {
    if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) return current;
    if (t === "number") value = value.toString();
    if (multi) {
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data = value;
      } else node = document.createTextNode(value);
      current = cleanChildren(parent, current, marker, node);
    } else {
      if (current !== "" && typeof current === "string") {
        current = parent.firstChild.data = value;
      } else current = parent.textContent = value;
    }
  } else if (value == null || t === "boolean") {
    if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) return current;
    current = cleanChildren(parent, current, marker);
  } else if (t === "function") {
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  } else if (Array.isArray(value)) {
    const array = [];
    if (normalizeIncomingArray(array, value, unwrapArray)) {
      (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRenderEffect)(() => current = insertExpression(parent, array, current, marker, true));
      return () => current;
    }
    if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) {
      for (let i = 0; i < array.length; i++) {
        if (array[i].parentNode) return current = array;
      }
    }
    if (array.length === 0) {
      current = cleanChildren(parent, current, marker);
      if (multi) return current;
    } else if (Array.isArray(current)) {
      if (current.length === 0) {
        appendNodes(parent, array, marker);
      } else reconcileArrays(parent, current, array);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, array);
    }
    current = array;
  } else if (value instanceof Node) {
    if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context && value.parentNode) return current = multi ? [value] : value;
    if (Array.isArray(current)) {
      if (multi) return current = cleanChildren(parent, current, marker, value);
      cleanChildren(parent, current, null, value);
    } else if (current == null || current === "" || !parent.firstChild) {
      parent.appendChild(value);
    } else parent.replaceChild(value, parent.firstChild);
    current = value;
  } else console.warn(`Unrecognized value. Skipped inserting`, value);
  return current;
}
function normalizeIncomingArray(normalized, array, unwrap) {
  let dynamic = false;
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i],
        t;
    if (item instanceof Node) {
      normalized.push(item);
    } else if (item == null || item === true || item === false) ; else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item) || dynamic;
    } else if ((t = typeof item) === "string") {
      normalized.push(document.createTextNode(item));
    } else if (t === "function") {
      if (unwrap) {
        while (typeof item === "function") item = item();
        dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item]) || dynamic;
      } else {
        normalized.push(item);
        dynamic = true;
      }
    } else normalized.push(document.createTextNode(item.toString()));
  }
  return dynamic;
}
function appendNodes(parent, array, marker) {
  for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === undefined) return parent.textContent = "";
  const node = replacement || document.createTextNode("");
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (node !== el) {
        const isParent = el.parentNode === parent;
        if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
      } else inserted = true;
    }
  } else parent.insertBefore(node, marker);
  return [node];
}
function gatherHydratable(element, root) {
  const templates = element.querySelectorAll(`*[data-hk]`);
  for (let i = 0; i < templates.length; i++) {
    const node = templates[i];
    const key = node.getAttribute("data-hk");
    if (!root || key.startsWith(root)) solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.registry.set(key, node);
  }
}
function getHydrationKey() {
  const hydrate = solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context;
  return `${hydrate.id}${hydrate.count++}`;
}
function Assets() {
  return;
}
function NoHydration(props) {
  return solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context ? undefined : props.children;
}

function throwInBrowser(func) {
  const err = new Error(`${func.name} is not supported in the browser, returning undefined`);
  console.error(err);
}
function renderToString(fn, options) {
  throwInBrowser(renderToString);
}
function renderToStringAsync(fn, options) {
  throwInBrowser(renderToStringAsync);
}
function renderToStream(fn, options) {
  throwInBrowser(renderToStream);
}
function ssr(template, ...nodes) {}
function resolveSSRNode(node) {}
function ssrClassList(value) {}
function ssrStyle(value) {}
function ssrSpread(accessor) {}
function ssrBoolean(key, value) {}
function ssrHydrationKey() {}
function escape(html) {}
function generateHydrationScript() {}

const isServer = false;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
function createElement(tagName, isSVG = false) {
  return isSVG ? document.createElementNS(SVG_NAMESPACE, tagName) : document.createElement(tagName);
}
const hydrate = (...args) => {
  (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.enableHydration)();
  return hydrate$1(...args);
};
function Portal(props) {
  const {
    useShadow
  } = props,
        marker = document.createTextNode(""),
        mount = props.mount || document.body;
  function renderPortal() {
    if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) {
      const [s, set] = (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createSignal)(false);
      queueMicrotask(() => set(true));
      return () => s() && props.children;
    } else return () => props.children;
  }
  if (mount instanceof HTMLHeadElement) {
    const [clean, setClean] = (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createSignal)(false);
    const cleanup = () => setClean(true);
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createRoot)(dispose => insert(mount, () => !clean() ? renderPortal()() : dispose(), null));
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.onCleanup)(() => {
      if (solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context) queueMicrotask(cleanup);else cleanup();
    });
  } else {
    const container = createElement(props.isSVG ? "g" : "div", props.isSVG),
          renderRoot = useShadow && container.attachShadow ? container.attachShadow({
      mode: "open"
    }) : container;
    Object.defineProperty(container, "host", {
      get() {
        return marker.parentNode;
      }
    });
    insert(renderRoot, renderPortal());
    mount.appendChild(container);
    props.ref && props.ref(container);
    (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.onCleanup)(() => mount.removeChild(container));
  }
  return marker;
}
function Dynamic(props) {
  const [p, others] = (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.splitProps)(props, ["component"]);
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.createMemo)(() => {
    const component = p.component;
    switch (typeof component) {
      case "function":
        Object.assign(component, {
          [solid_js__WEBPACK_IMPORTED_MODULE_0__.$DEVCOMP]: true
        });
        return (0,solid_js__WEBPACK_IMPORTED_MODULE_0__.untrack)(() => component(others));
      case "string":
        const isSvg = SVGElements.has(component);
        const el = solid_js__WEBPACK_IMPORTED_MODULE_0__.sharedConfig.context ? getNextElement() : createElement(component, isSvg);
        spread(el, others, isSvg);
        return el;
    }
  });
}




/***/ }),

/***/ "./node_modules/solid-styled-components/src/index.js":
/*!***********************************************************!*\
  !*** ./node_modules/solid-styled-components/src/index.js ***!
  \***********************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ThemeProvider": () => (/* binding */ ThemeProvider),
/* harmony export */   "createGlobalStyles": () => (/* binding */ createGlobalStyles),
/* harmony export */   "css": () => (/* reexport safe */ goober__WEBPACK_IMPORTED_MODULE_0__.css),
/* harmony export */   "extractCss": () => (/* reexport safe */ goober__WEBPACK_IMPORTED_MODULE_0__.extractCss),
/* harmony export */   "glob": () => (/* reexport safe */ goober__WEBPACK_IMPORTED_MODULE_0__.glob),
/* harmony export */   "keyframes": () => (/* reexport safe */ goober__WEBPACK_IMPORTED_MODULE_0__.keyframes),
/* harmony export */   "setup": () => (/* binding */ setup),
/* harmony export */   "styled": () => (/* binding */ styled),
/* harmony export */   "useTheme": () => (/* binding */ useTheme)
/* harmony export */ });
/* harmony import */ var goober__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! goober */ "./node_modules/goober/dist/goober.modern.js");
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");




function setup(prefixer) {
  (0,goober__WEBPACK_IMPORTED_MODULE_0__.setup)(null, prefixer);
}
const ThemeContext = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createContext)();
function ThemeProvider(props) {
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.createComponent)(ThemeContext.Provider, {
    value: props.theme,
    get children() {
      return props.children;
    }
  });
}
function useTheme() {
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.useContext)(ThemeContext);
}

function makeStyled(tag) {
  let _ctx = this || {};
  return (...args) => {
    const Styled = props => {
      const theme = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.useContext)(ThemeContext);
      const withTheme = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.mergeProps)(props, { theme });
      const clone = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.mergeProps)(withTheme, {
        get className() {
          const pClassName = withTheme.className,
            append = "className" in withTheme && /^go[0-9]+/.test(pClassName);
          // Call `css` with the append flag and pass the props
          let className = goober__WEBPACK_IMPORTED_MODULE_0__.css.apply(
            { target: _ctx.target, o: append, p: withTheme, g: _ctx.g },
            args
          );
          return [pClassName, className].filter(Boolean).join(" ");
        }
      });
      const [local, newProps] = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.splitProps)(clone, ["as"]);
      const createTag = local.as || tag;
      let el;
      if (typeof createTag === "function") {
        el = createTag(newProps);
      } else if (solid_js_web__WEBPACK_IMPORTED_MODULE_2__.isServer) {
        const [local, others] = (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.splitProps)(newProps, ["children"]);
        el = (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.ssr)(
          [`<${createTag} `, ">", `</${createTag}>`],
          (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.ssrSpread)(others),
          local.children || ""
        );
      } else {
        el = document.createElement(createTag);
        (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.spread)(el, newProps);
      }
      return el;
    };
    Styled.className = props => {
      return (0,solid_js__WEBPACK_IMPORTED_MODULE_1__.untrack)(() => {
        return goober__WEBPACK_IMPORTED_MODULE_0__.css.apply({ target: _ctx.target, p: props, g: _ctx.g }, args);
      });
    };
    return Styled;
  };
}

const styled = new Proxy(makeStyled, {
  get(target, tag) {
    return target(tag);
  },
})

function createGlobalStyles() {
  const fn = makeStyled.call({ g: 1 }, "div").apply(null, arguments);
  return function GlobalStyles(props) {
    fn(props);
    return null;
  };
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		var scriptUrl;
/******/ 		if (__webpack_require__.g.importScripts) scriptUrl = __webpack_require__.g.location + "";
/******/ 		var document = __webpack_require__.g.document;
/******/ 		if (!scriptUrl && document) {
/******/ 			if (document.currentScript)
/******/ 				scriptUrl = document.currentScript.src
/******/ 			if (!scriptUrl) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				if(scripts.length) scriptUrl = scripts[scripts.length - 1].src
/******/ 			}
/******/ 		}
/******/ 		// When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
/******/ 		// or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
/******/ 		if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");
/******/ 		scriptUrl = scriptUrl.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
/******/ 		__webpack_require__.p = scriptUrl;
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!**************************!*\
  !*** ./src/ts/index.tsx ***!
  \**************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var _ui_application_Application__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ui/application/Application */ "./src/ts/ui/application/Application.tsx");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _ui_theme__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ui/theme */ "./src/ts/ui/theme.tsx");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");





document.addEventListener("readystatechange", e => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    (0,solid_js_web__WEBPACK_IMPORTED_MODULE_2__.render)(() => (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(solid_styled_components__WEBPACK_IMPORTED_MODULE_4__.ThemeProvider, {
      theme: _ui_theme__WEBPACK_IMPORTED_MODULE_1__.theme,

      get children() {
        return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_3__.createComponent)(_ui_application_Application__WEBPACK_IMPORTED_MODULE_0__.Application, {});
      }

    }), document.querySelector("#application"));
  }
});
})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=index_bundle.js.map