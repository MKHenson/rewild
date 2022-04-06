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

/***/ "./src/common/Commands.ts":
/*!********************************!*\
  !*** ./src/common/Commands.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Commands": () => (/* binding */ Commands),
/* harmony export */   "GPUCommands": () => (/* binding */ GPUCommands)
/* harmony export */ });
let Commands;

(function (Commands) {
  Commands[Commands["CLEAR"] = 0] = "CLEAR";
  Commands[Commands["RENDER_VAO"] = 1] = "RENDER_VAO";
  Commands[Commands["ACTIVATE_SHADER"] = 2] = "ACTIVATE_SHADER";
  Commands[Commands["UMATRIX4FV"] = 3] = "UMATRIX4FV";
  Commands[Commands["UTEXTURE2D"] = 4] = "UTEXTURE2D";
  Commands[Commands["GL_DEPTH_MASK"] = 5] = "GL_DEPTH_MASK";
  Commands[Commands["GL_DEPTH_FUNC"] = 6] = "GL_DEPTH_FUNC";
  Commands[Commands["GL_CLEAR_DEPTH"] = 7] = "GL_CLEAR_DEPTH";
  Commands[Commands["GL_ENABLE"] = 8] = "GL_ENABLE";
  Commands[Commands["GL_DISABLE"] = 9] = "GL_DISABLE";
  Commands[Commands["GL_STENCIL_MASK"] = 10] = "GL_STENCIL_MASK";
  Commands[Commands["GL_STENCIL_FUNC"] = 11] = "GL_STENCIL_FUNC";
  Commands[Commands["GL_STENCIL_OP"] = 12] = "GL_STENCIL_OP";
  Commands[Commands["GL_CLEAR_STENCIL"] = 13] = "GL_CLEAR_STENCIL";
  Commands[Commands["GL_POLYGON_OFFSET"] = 14] = "GL_POLYGON_OFFSET";
  Commands[Commands["GL_CULLFACE"] = 15] = "GL_CULLFACE";
  Commands[Commands["GL_COLOR_MASK"] = 16] = "GL_COLOR_MASK";
  Commands[Commands["GL_CLEAR_COLOR"] = 17] = "GL_CLEAR_COLOR";
  Commands[Commands["GL_FRONT_FACE"] = 18] = "GL_FRONT_FACE";
  Commands[Commands["GL_BLEND_EQUATION"] = 19] = "GL_BLEND_EQUATION";
  Commands[Commands["GL_BLEND_FUNC"] = 20] = "GL_BLEND_FUNC";
  Commands[Commands["GL_BLEND_EQUATION_SEPARATE"] = 21] = "GL_BLEND_EQUATION_SEPARATE";
  Commands[Commands["GL_BLEND_FUNC_SEPARATE"] = 22] = "GL_BLEND_FUNC_SEPARATE";
})(Commands || (Commands = {}));

let GPUCommands;

(function (GPUCommands) {
  GPUCommands[GPUCommands["SET_PIPELINE"] = 0] = "SET_PIPELINE";
  GPUCommands[GPUCommands["SET_TRANSFORM"] = 1] = "SET_TRANSFORM";
  GPUCommands[GPUCommands["SETUP_LIGHTING"] = 2] = "SETUP_LIGHTING";
  GPUCommands[GPUCommands["SET_INDEX_BUFFER"] = 3] = "SET_INDEX_BUFFER";
  GPUCommands[GPUCommands["SET_BUFFER"] = 4] = "SET_BUFFER";
  GPUCommands[GPUCommands["START_PASS"] = 5] = "START_PASS";
  GPUCommands[GPUCommands["SET_BIND_GROUP"] = 6] = "SET_BIND_GROUP";
  GPUCommands[GPUCommands["END_PASS"] = 7] = "END_PASS";
  GPUCommands[GPUCommands["DRAW_INDEXED"] = 8] = "DRAW_INDEXED";
})(GPUCommands || (GPUCommands = {}));

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

/***/ "./src/common/PipelineType.ts":
/*!************************************!*\
  !*** ./src/common/PipelineType.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PipelineType": () => (/* binding */ PipelineType)
/* harmony export */ });
let PipelineType;

(function (PipelineType) {
  PipelineType[PipelineType["Mesh"] = 0] = "Mesh";
})(PipelineType || (PipelineType = {}));

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
/* harmony import */ var _common_PipelineType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../common/PipelineType */ "./src/common/PipelineType.ts");
/* harmony import */ var _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./pipelines/debug-pipeline */ "./src/ts/core/pipelines/debug-pipeline/index.ts");
/* harmony import */ var _Utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Utils */ "./src/ts/core/Utils.ts");
/* harmony import */ var _RenderQueueManager__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./RenderQueueManager */ "./src/ts/core/RenderQueueManager.ts");
/* harmony import */ var _Texture__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./Texture */ "./src/ts/core/Texture.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../common/ResourceType */ "./src/common/ResourceType.ts");








const meshPipelineInstances = [];
const sampleCount = 4;
class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.buffers = [];
    this.textures = [];
    this.samplers = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
  }

  createBinding() {
    return {
      createBufferFromF32: this.createBufferF32.bind(this),
      createIndexBuffer: this.createIndexBuffer.bind(this),
      render: commandsIndex => {
        const commandBuffer = this.wasmManager.exports.__getArray(commandsIndex);

        this.renderQueueManager.run(commandBuffer);
      }
    };
  }

  async init(wasmManager) {
    var _navigator$gpu;

    this.wasmManager = wasmManager;
    this.renderQueueManager = new _RenderQueueManager__WEBPACK_IMPORTED_MODULE_4__.RenderQueueManager(this, wasmManager);
    const wasmExports = wasmManager.exports;
    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");
    this.inputManager = new _InputManager__WEBPACK_IMPORTED_MODULE_0__.InputManager(this.canvas, wasmManager);
    const adapter = await ((_navigator$gpu = navigator.gpu) === null || _navigator$gpu === void 0 ? void 0 : _navigator$gpu.requestAdapter());
    const device = await (adapter === null || adapter === void 0 ? void 0 : adapter.requestDevice());
    const context = this.canvas.getContext("webgpu");
    const format = context.getPreferredFormat(adapter);
    context.configure({
      device: device,
      format: format,
      size: this.canvasSize(),
      compositingAlphaMode: "premultiplied"
    });
    this.device = device;
    this.context = context;
    this.format = format;
    this.samplers = [device.createSampler({
      minFilter: "linear",
      magFilter: "linear"
    })]; // TEXTURES

    const texturePaths = [{
      name: "grid",
      src: "https://storage.googleapis.com/rewild-6809/uv-grid.jpg"
    }, {
      name: "crate",
      src: "https://storage.googleapis.com/rewild-6809/crate-wooden.jpg"
    }, {
      name: "earth",
      src: "https://storage.googleapis.com/rewild-6809/earth-day-2k.jpg"
    }];
    this.textures = await Promise.all(texturePaths.map((tp, index) => {
      const texture = new _Texture__WEBPACK_IMPORTED_MODULE_5__.Texture(tp.name, tp.src);
      wasmExports.createTexture(wasmExports.__newString(tp.name), index);
      return texture.load(device);
    })); // PIPELINES

    this.pipelines = [new _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__.DebugPipeline("textured", {
      diffuseMap: this.textures[1],
      NUM_DIR_LIGHTS: 0
    }), new _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__.DebugPipeline("simple", {
      NUM_DIR_LIGHTS: 0
    }), new _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__.DebugPipeline("earth", {
      diffuseMap: this.textures[2],
      NUM_DIR_LIGHTS: 0
    })];
    const size = this.canvasSize();
    this.onResize(size, false); // Initialize the wasm module

    wasmExports.init(this.canvas.width, this.canvas.height);
    this.initRuntime(); // Setup events

    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler); // window.addEventListener("click", (e) => {
    //   const pipelines = this.pipelines as DebugPipeline[];
    //   pipelines.forEach((p) => {
    //     if (p.defines.diffuseMap) {
    //       delete p.defines.diffuseMap;
    //       p.defines = p.defines;
    //     } else {
    //       p.defines.diffuseMap = this.textures[1];
    //       p.defines = p.defines;
    //     }
    //   });
    // });
  }

  getTexture(name) {
    return this.textures.find(t => t.name === name) || null;
  }

  initRuntime() {
    const wasm = this.wasmManager.exports;
    const runime = wasm.Runtime.wrap(wasm.getRuntime());
    this.pipelines.forEach(p => {
      p.build(this);
      p.initialize(this);
    });

    const containerLvl1Ptr = wasm.__pin(wasm.createLevel1());

    const containerLvl1 = wasm.Level1.wrap(containerLvl1Ptr);
    containerLvl1.addAsset(this.createMesh(1, "sphere", "simple"));
    containerLvl1.addAsset(this.createMesh(1, "box", "textured"));
    containerLvl1.addAsset(this.createMesh(1, "box", "textured"));

    wasm.__unpin(containerLvl1Ptr);

    const containerMainMenuPtr = wasm.__pin(wasm.createMainMenu());

    const containerMainMenu = wasm.MainMenu.wrap(containerMainMenuPtr);
    containerMainMenu.addAsset(this.createMesh(1, "sphere", "earth"));

    wasm.__unpin(containerMainMenuPtr);

    runime.addContainer(containerLvl1Ptr, false);
    runime.addContainer(containerMainMenuPtr, true);
  }

  createMesh(size, type, pipelineName) {
    // Get the pipeline
    const debugPipeline = this.getPipeline(pipelineName);
    const pipelineIndex = this.pipelines.indexOf(debugPipeline);
    const wasmExports = this.wasmManager.exports; // Create an instance in WASM

    const pipelineInsPtr = wasmExports.createPipeline(wasmExports.__newString(debugPipeline.name), pipelineIndex, _common_PipelineType__WEBPACK_IMPORTED_MODULE_1__.PipelineType.Mesh);
    const meshPipelineIns = wasmExports.MeshPipeline.wrap(pipelineInsPtr);
    meshPipelineInstances.push(meshPipelineIns); // Assign a transform buffer to the intance

    meshPipelineIns.transformGroupId = debugPipeline.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_7__.ResourceType.Transform).template.group;
    meshPipelineIns.transformResourceIndex = debugPipeline.addResourceInstance(this, _common_GroupType__WEBPACK_IMPORTED_MODULE_6__.GroupType.Transform);
    const geometryPtr = type === "box" ? wasmExports.createBox(size) : wasmExports.createSphere(size);
    const meshPtr = wasmExports.createMesh(geometryPtr, pipelineInsPtr);
    return meshPtr;
  }

  dispose() {
    var _this$inputManager;

    this.disposed = true;
    window.removeEventListener("resize", this.onResizeHandler);
    (_this$inputManager = this.inputManager) === null || _this$inputManager === void 0 ? void 0 : _this$inputManager.dispose();
  }

  onResize(newSize) {
    let updateWasm = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

    if (this.renderTarget) {
      // Destroy the previous render target
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
    if (updateWasm) this.wasmManager.exports.resize(this.canvas.width, this.canvas.height);
  }

  onFrame() {
    window.requestAnimationFrame(this.onFrameHandler);
    if (this.disposed) return; // Check if we need to resize

    const [w, h] = this.presentationSize;
    const newSize = this.canvasSize();

    if (newSize[0] !== w || newSize[1] !== h) {
      this.onResize(newSize);
    }

    this.wasmManager.exports.update(performance.now());
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

  getPipeline(name) {
    return this.pipelines.find(p => p.name === name);
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

    const f32Array = this.wasmManager.exports.__getFloat32Array(data);

    const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createBuffer)(this.device, f32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(data) {
    let usageFlag = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;

    const u32Array = this.wasmManager.exports.__getUint32Array(data);

    const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createIndexBuffer)(this.device, u32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
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
  constructor(canvas, wasm) {
    this.wasmManager = wasm;
    this.canvas = canvas;
    this.canvasBounds = canvas.getBoundingClientRect();
    this.onDownHandler = this.onDown.bind(this);
    this.onUpHandler = this.onUp.bind(this);
    this.onKeyDownHandler = this.onKeyDown.bind(this);
    this.onKeyUpHandler = this.onKeyUp.bind(this);
    this.onMoveHandler = this.onMove.bind(this);
    this.onWheelHandler = this.onWheel.bind(this);
    this.canvas.addEventListener("mousedown", this.onDownHandler);
    window.addEventListener("wheel", this.onWheelHandler);
    window.addEventListener("mouseup", this.onUpHandler);
    window.addEventListener("mousemove", this.onMoveHandler);
    document.addEventListener("keydown", this.onKeyDownHandler);
    document.addEventListener("keyup", this.onKeyUpHandler);
    this.reset();
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
    const wasmExports = this.wasmManager.exports;

    const mouseEventPtr = wasmExports.__pin(wasmExports.createMouseEvent(e.clientX, e.clientY, e.pageX, e.pageY, e.ctrlKey, e.shiftKey, e.altKey, e.button, e.buttons, bounds.x, bounds.y, bounds.width, bounds.height, delta));

    return mouseEventPtr;
  }

  sendMouseEvent(type, event, bounds, delta) {
    const wasmExports = this.wasmManager.exports;
    const manager = wasmExports.InputManager.wrap(wasmExports.getInputManager());
    const wasmEvent = this.createMouseEvent(event, bounds, delta);
    if (type === MouseEventType.MouseUp) manager.onMouseUp(wasmEvent);else if (type === MouseEventType.MouseMove) manager.onMouseMove(wasmEvent);else if (type === MouseEventType.MouseDown) manager.onMouseDown(wasmEvent);else if (type === MouseEventType.MouseWheel) manager.onWheel(wasmEvent);

    wasmExports.__unpin(wasmEvent);
  }

  sendKeyEvent(type, event) {
    const wasmExports = this.wasmManager.exports;
    const manager = wasmExports.InputManager.wrap(wasmExports.getInputManager());

    const wasmEvent = wasmExports.__pin(wasmExports.createKeyboardEvent(wasmExports.__newString(event.code)));

    if (type === KeyEventType.KeyUp) manager.onKeyUp(wasmEvent);else if (type === KeyEventType.KeyDown) manager.onKeyDown(wasmEvent);

    wasmExports.__unpin(wasmEvent);
  }

  dispose() {
    this.canvas.removeEventListener("mousedown", this.onDownHandler);
    window.removeEventListener("mouseup", this.onUpHandler);
    window.removeEventListener("wheel", this.onWheelHandler);
    window.removeEventListener("mousemove", this.onMoveHandler);
    document.removeEventListener("keydown", this.onKeyDownHandler);
    document.removeEventListener("keyup", this.onKeyUpHandler);
  }

}

/***/ }),

/***/ "./src/ts/core/RenderQueueManager.ts":
/*!*******************************************!*\
  !*** ./src/ts/core/RenderQueueManager.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "RenderQueueManager": () => (/* binding */ RenderQueueManager)
/* harmony export */ });
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../common/ResourceType */ "./src/common/ResourceType.ts");
/* harmony import */ var _common_Commands__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../common/Commands */ "./src/common/Commands.ts");
/* harmony import */ var _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./pipelines/resources/LightingResource */ "./src/ts/core/pipelines/resources/LightingResource.ts");




const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
const normalAs4x4 = new Float32Array(12);
class RenderQueueManager {
  constructor(manager, wasmManager) {
    this.manager = manager;
    this.wasmManager = wasmManager;
  }

  run(commandBuffer) {
    var _instances;

    const manager = this.manager;
    const device = manager.device;
    const {
      wasmArrayBuffer,
      wasmMemoryBlock
    } = this.wasmManager;

    const getPtrIndex = function (ptr) {
      return wasmArrayBuffer[ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2];
    };

    getPtrIndex;
    let pipeline, buffer, instances, resourceIndex;
    let pass = manager.currentPass;

    for (let i = 0, l = commandBuffer.length; i < l; i++) {
      const command = commandBuffer[i];

      switch (command) {
        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SETUP_LIGHTING:
          const numDirectionLights = commandBuffer[i + 1];

          if (_pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.numDirLights !== numDirectionLights) {
            _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.numDirLights = numDirectionLights;
            _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.rebuildDirectionLights = true;
            this.manager.pipelines.forEach(p => {
              if (p.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Material)) {
                p.defines = { ...p.defines,
                  NUM_DIR_LIGHTS: numDirectionLights
                };
              }
            });
          }

          buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.lightingConfig;

          if (buffer) {
            const info = getPtrIndex(commandBuffer[i + 2]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, info, 4);
          }

          buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.sceneLightingBuffer;

          if (buffer) {
            const ambientLights = getPtrIndex(commandBuffer[i + 3]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, ambientLights, 4 * 4);
          }

          buffer = _pipelines_resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource.directionLightsBuffer;

          if (buffer) {
            const dirLights = getPtrIndex(commandBuffer[i + 4]);
            device.queue.writeBuffer(buffer, 0, wasmMemoryBlock, dirLights, numDirectionLights * 4 * 4 * 2);
          }

          i += 4;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SET_TRANSFORM:
          instances = pipeline.groupInstances.get(_common_GroupType__WEBPACK_IMPORTED_MODULE_0__.GroupType.Transform);
          resourceIndex = commandBuffer[i + 1];
          const projMatrixPtr = getPtrIndex(commandBuffer[i + 2]);
          const mvMatrixPtr = getPtrIndex(commandBuffer[i + 3]);
          const normMatrixPtr = getPtrIndex(commandBuffer[i + 4]);
          const mat3x3 = new Float32Array(wasmMemoryBlock, normMatrixPtr, 9); // TODO: Make this neater

          normalAs4x4[0] = mat3x3[0];
          normalAs4x4[1] = mat3x3[1];
          normalAs4x4[2] = mat3x3[2];
          normalAs4x4[4] = mat3x3[3];
          normalAs4x4[5] = mat3x3[4];
          normalAs4x4[6] = mat3x3[5];
          normalAs4x4[8] = mat3x3[6];
          normalAs4x4[9] = mat3x3[7];
          normalAs4x4[10] = mat3x3[8];
          const transformBuffer = instances[resourceIndex].buffers[0];
          device.queue.writeBuffer(transformBuffer, 0, wasmMemoryBlock, projMatrixPtr, 64);
          device.queue.writeBuffer(transformBuffer, 64, wasmMemoryBlock, mvMatrixPtr, 64);
          device.queue.writeBuffer(transformBuffer, 128, normalAs4x4);
          i += 4;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SET_INDEX_BUFFER:
          buffer = manager.buffers[commandBuffer[i + 1]];
          pass.setIndexBuffer(buffer, "uint32");
          i += 1;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SET_BUFFER:
          const slot = commandBuffer[i + 1];
          buffer = manager.buffers[commandBuffer[i + 2]];
          pass.setVertexBuffer(slot, buffer);
          i += 2;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.DRAW_INDEXED:
          const indexCount = commandBuffer[i + 1];
          pass.drawIndexed(indexCount);
          i += 1;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SET_PIPELINE:
          const newPipeline = manager.pipelines[commandBuffer[i + 1]];

          if (newPipeline.rebuild) {
            newPipeline.build(manager);
            newPipeline.initialize(manager);
          }

          if (newPipeline === pipeline) {
            i += 1;
            break;
          }

          pipeline = newPipeline;
          pass.setPipeline(pipeline.renderPipeline);
          i += 1;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.SET_BIND_GROUP:
          instances = pipeline.groupInstances.get(commandBuffer[i + 1]);
          const instance = (_instances = instances) === null || _instances === void 0 ? void 0 : _instances[commandBuffer[i + 2]];
          if (instance) pass.setBindGroup(instance.group, instance.bindGroup);
          i += 2;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.START_PASS:
          manager.startPass();
          pass = manager.currentPass;
          break;

        case _common_Commands__WEBPACK_IMPORTED_MODULE_2__.GPUCommands.END_PASS:
          manager.endPass();
          break;
      }
    }
  }

}

/***/ }),

/***/ "./src/ts/core/Texture.ts":
/*!********************************!*\
  !*** ./src/ts/core/Texture.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Texture": () => (/* binding */ Texture)
/* harmony export */ });
class Texture {
  constructor(name, src) {
    this.name = name;
    this.src = src;
  }

  async load(device) {
    let gpuTexture;
    const img = document.createElement("img");
    img.crossOrigin = "Anonymous";
    img.src = this.src;
    await img.decode();
    this.imageData = await createImageBitmap(img);
    gpuTexture = device.createTexture({
      size: [this.imageData.width, this.imageData.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture({
      source: this.imageData
    }, {
      texture: gpuTexture
    }, [this.imageData.width, this.imageData.height]);
    this.gpuTexture = gpuTexture;
    return this;
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


const uiEvent = new _events_UIEvent__WEBPACK_IMPORTED_MODULE_1__.UIEvent();
class UIEventManager extends _EventDispatcher__WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor(wasm) {
    super();
    this.wasmManager = wasm;
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
    const wasmExports = this.wasmManager.exports;
    const manager = wasmExports.UISignalManager.wrap(wasmExports.getSignalManager());
    manager.onSignalEvent(type);
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
/* harmony export */   "createIndexBuffer": () => (/* binding */ createIndexBuffer)
/* harmony export */ });
function createBuffer(device, data) {
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
function createIndexBuffer(device, data) {
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
/* harmony export */   "WasmManager": () => (/* binding */ WasmManager)
/* harmony export */ });
/* harmony import */ var _build_untouched_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../build/untouched.wasm */ "./build/untouched.wasm");
/* harmony import */ var _assemblyscript_loader__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @assemblyscript/loader */ "./node_modules/@assemblyscript/loader/index.js");


class WasmManager {
  constructor() {}

  async load(bindables) {
    var _this = this;

    // Creating WASM with Linear memory
    this.memory = new WebAssembly.Memory({
      initial: 100
    });
    this.importObject = {
      env: {
        memory: this.memory,
        seed: Date.now,
        abort: function () {
          console.error(_this.importObject.env.getString(arguments.length <= 0 ? undefined : arguments[0]));
          console.error(_this.importObject.env.getString(arguments.length <= 1 ? undefined : arguments[1]));
        },
        getString: string_index => {
          const buffer = this.importObject.env.memory.buffer;
          const U32 = new Uint32Array(buffer);
          const id_addr = string_index / 4 - 2;
          const id = U32[id_addr];
          if (id !== 0x01) throw Error(`not a string index=${string_index} id=${id}`);
          const len = U32[id_addr + 1];
          const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
          return str;
        }
      }
    };
    if (!this.importObject.env.memory) throw new Error("You need to set memory in your importObject");
    const bindings = {
      print: stringIndex => {
        if (this.exports) console.log(this.exports.__getString(stringIndex));
      }
    };

    for (const bindable of bindables) Object.assign(bindings, bindable.createBinding());

    this.importObject.Imports = bindings;
    const obj = await _assemblyscript_loader__WEBPACK_IMPORTED_MODULE_1__["default"].instantiateStreaming(fetch(_build_untouched_wasm__WEBPACK_IMPORTED_MODULE_0__["default"]), this.importObject);
    this.exports = obj.exports;
    this.wasmMemoryBlock = obj.exports.memory.buffer;
    this.wasmArrayBuffer = new Uint32Array(this.wasmMemoryBlock);
    this.wasmDataView = new DataView(this.exports.memory.buffer);
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

/***/ "./src/ts/core/pipelines/DefaultPipelineDescriptor.ts":
/*!************************************************************!*\
  !*** ./src/ts/core/pipelines/DefaultPipelineDescriptor.ts ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "defaultPipelineDescriptor": () => (/* binding */ defaultPipelineDescriptor)
/* harmony export */ });
const defaultPipelineDescriptor = {
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
    frontFace: "ccw"
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less"
  },
  multisample: {
    count: 4
  }
};

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

/***/ "./src/ts/core/pipelines/debug-pipeline/index.ts":
/*!*******************************************************!*\
  !*** ./src/ts/core/pipelines/debug-pipeline/index.ts ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "DebugPipeline": () => (/* binding */ DebugPipeline)
/* harmony export */ });
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");
/* harmony import */ var _DefaultPipelineDescriptor__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../DefaultPipelineDescriptor */ "./src/ts/core/pipelines/DefaultPipelineDescriptor.ts");
/* harmony import */ var _Pipeline__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../Pipeline */ "./src/ts/core/pipelines/Pipeline.ts");
/* harmony import */ var _resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../resources/LightingResource */ "./src/ts/core/pipelines/resources/LightingResource.ts");
/* harmony import */ var _resources_MaterialResource__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../resources/MaterialResource */ "./src/ts/core/pipelines/resources/MaterialResource.ts");
/* harmony import */ var _resources_TextureResource__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../resources/TextureResource */ "./src/ts/core/pipelines/resources/TextureResource.ts");
/* harmony import */ var _resources_TransformResource__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../resources/TransformResource */ "./src/ts/core/pipelines/resources/TransformResource.ts");
/* harmony import */ var _shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../shader-lib/MathFunctions */ "./src/ts/core/pipelines/shader-lib/MathFunctions.ts");
/* harmony import */ var _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../shader-lib/Utils */ "./src/ts/core/pipelines/shader-lib/Utils.ts");








 // prettier-ignore

const vertexShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shader`
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Transform).template.vertexBlock}

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
    output.vFragUV = uv;

    var transformedNormal = uniforms.normalMatrix * norm.xyz;
    output.vNormal = normalize( transformedNormal );

    return output;
}
`; // prettier-ignore

const fragmentShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shader`

${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Lighting).template.fragmentBlock}
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Material).template.fragmentBlock}
${e => e.defines.diffuseMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Texture, 'diffuse').template.fragmentBlock : ''}
${e => e.defines.normalMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Texture, 'normal').template.fragmentBlock : ''}

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

${_shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_7__.mathConstants}
${_shader_lib_MathFunctions__WEBPACK_IMPORTED_MODULE_7__.mathFunctions}

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
class DebugPipeline extends _Pipeline__WEBPACK_IMPORTED_MODULE_2__.Pipeline {
  constructor(name, defines) {
    super(name, vertexShader, fragmentShader, defines);
  }

  onAddResources() {
    const transformResource = new _resources_TransformResource__WEBPACK_IMPORTED_MODULE_6__.TransformResource();
    this.addTemplate(transformResource);
    const materialResource = new _resources_MaterialResource__WEBPACK_IMPORTED_MODULE_4__.MaterialResource();
    this.addTemplate(materialResource);
    const lightingResource = new _resources_LightingResource__WEBPACK_IMPORTED_MODULE_3__.LightingResource();
    this.addTemplate(lightingResource);

    if (this.defines.diffuseMap) {
      const resource = new _resources_TextureResource__WEBPACK_IMPORTED_MODULE_5__.TextureResource(this.defines.diffuseMap, "diffuse");
      this.addTemplate(resource);
    }

    if (this.defines.normalMap) {
      const resource = new _resources_TextureResource__WEBPACK_IMPORTED_MODULE_5__.TextureResource(this.defines.normalMap, "normal");
      this.addTemplate(resource);
    }
  }

  build(gameManager) {
    super.build(gameManager); // Build the shaders - should go after adding the resources as we might use those in the shader source

    const vertSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shaderBuilder)(this.vertexSource, this);
    const fragSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shaderBuilder)(this.fragmentSource, this);
    this.renderPipeline = gameManager.device.createRenderPipeline({ ..._DefaultPipelineDescriptor__WEBPACK_IMPORTED_MODULE_1__.defaultPipelineDescriptor,
      label: "Debug Pipeline",
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource
        }),
        entryPoint: "main",
        buffers: [{
          arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
          // (3 + 2)
          attributes: [{
            shaderLocation: 0,
            format: "float32x3",
            offset: 0
          } // {
          //   shaderLocation: 1,
          //   format: "float32x3",
          //   offset: 12,
          // },
          ]
        }, {
          arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
          attributes: [{
            shaderLocation: 1,
            format: "float32x3",
            offset: 0
          }]
        }, {
          arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
          attributes: [{
            shaderLocation: 2,
            format: "float32x2",
            offset: 0
          }]
        }]
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

}

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



class TextureResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceTemplate {
  constructor(texture, id) {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType.Material, _common_ResourceType__WEBPACK_IMPORTED_MODULE_2__.ResourceType.Texture, id);
    this.texture = texture;
  }

  build(manager, pipeline, curBindIndex) {
    this.samplerBind = curBindIndex;
    this.textureBind = curBindIndex + 1;
    const group = pipeline.groupIndex(this.groupType); // prettier-ignore

    return {
      group,
      bindings: [manager.samplers[0], this.texture.gpuTexture.createView()],
      fragmentBlock: `
      ${pipeline.defines.diffuseMap && `
      @group(${group}) @binding(${this.samplerBind})
      var ${this.id}Sampler: sampler;
      @group(${group}) @binding(${this.textureBind})
      var ${this.id}Texture: texture_2d<f32>;`}`,
      vertexBlock: null
    };
  }

  getBindingData(manager, pipeline) {
    return {
      binds: [{
        binding: this.samplerBind,
        resource: manager.samplers[0]
      }, {
        binding: this.textureBind,
        resource: this.texture.gpuTexture.createView()
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
/* harmony export */   "TransformResource": () => (/* binding */ TransformResource)
/* harmony export */ });
/* harmony import */ var _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MemoryUtils */ "./src/ts/core/pipelines/resources/MemoryUtils.ts");
/* harmony import */ var _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./PipelineResourceTemplate */ "./src/ts/core/pipelines/resources/PipelineResourceTemplate.ts");
/* harmony import */ var _common_GroupType__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../common/GroupType */ "./src/common/GroupType.ts");
/* harmony import */ var _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../../common/ResourceType */ "./src/common/ResourceType.ts");




class TransformResource extends _PipelineResourceTemplate__WEBPACK_IMPORTED_MODULE_1__.PipelineResourceTemplate {
  constructor() {
    super(_common_GroupType__WEBPACK_IMPORTED_MODULE_2__.GroupType.Transform, _common_ResourceType__WEBPACK_IMPORTED_MODULE_3__.ResourceType.Transform);
  }

  build(manager, pipeline, curBindIndex) {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);
    const SIZEOF_MATRICES = _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat3x3<f32>"];
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
        projMatrix: mat4x4<f32>,
        modelViewMatrix: mat4x4<f32>,
        normalMatrix: mat3x3<f32>
      };
      @group(${group}) @binding(${curBindIndex})
      var<uniform> uniforms: TransformUniform;
      `
    };
  }

  getBindingData(manager, pipeline) {
    const SIZEOF_MATRICES = _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat3x3<f32>"];
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

/***/ "./src/ts/ui/application/Application.tsx":
/*!***********************************************!*\
  !*** ./src/ts/ui/application/Application.tsx ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Application": () => (/* binding */ Application)
/* harmony export */ });
/* harmony import */ var solid_js__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! solid-js */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/web/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
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














const Application = _ref => {
  let {} = _ref;
  const [modalOpen, setModalOpen] = (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createSignal)(true);
  const [errorMessage, setErrorMessage] = (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createSignal)("");
  const [errorType, setErrorType] = (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createSignal)("OTHER");
  const [activeMenu, setActiveMenu] = (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createSignal)("main");
  const [gameIsRunning, setGameIsRunning] = (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createSignal)(false);
  let gameManager;
  let eventManager;
  const wasmManager = new _core_WasmManager__WEBPACK_IMPORTED_MODULE_2__.WasmManager();

  const onWasmUiEvent = event => {
    if (event.uiEventType === _common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.OpenInGameMenu) setModalOpen(!modalOpen());else if (event.uiEventType === _common_UIEventType__WEBPACK_IMPORTED_MODULE_6__.UIEventType.PlayerDied) setActiveMenu("gameOverMenu");
  };

  const onCanvasReady = async canvas => {
    gameManager = new _core_GameManager__WEBPACK_IMPORTED_MODULE_1__.GameManager(canvas);
    eventManager = new _core_UIEventManager__WEBPACK_IMPORTED_MODULE_0__.UIEventManager(wasmManager);
    const bindables = [gameManager, eventManager];

    try {
      await wasmManager.load(bindables);

      if (!gameManager.hasWebGPU()) {
        setErrorMessage("Your browser does not support WebGPU");
        setErrorType("WGPU");
        setActiveMenu("error");
        return;
      }

      await gameManager.init(wasmManager);
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
    main: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_MainMenu__WEBPACK_IMPORTED_MODULE_5__.MainMenu, {
      get open() {
        return modalOpen();
      },

      onStart: onStart
    }),
    ingameMenu: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_InGameMenu__WEBPACK_IMPORTED_MODULE_4__.InGameMenu, {
      get open() {
        return modalOpen();
      },

      onResumeClick: onResume,
      onQuitClick: onQuit
    }),
    gameOverMenu: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_GameOverMenu__WEBPACK_IMPORTED_MODULE_8__.GameOverMenu, {
      onQuitClick: onQuit,
      open: true
    }),
    error: () => (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_StartError__WEBPACK_IMPORTED_MODULE_9__.StartError, {
      open: true,

      get errorMsg() {
        return errorMessage();
      },

      get errorType() {
        return errorType();
      }

    })
  };
  return (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(StyledApplication, {
    get children() {
      return [(0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(solid_js__WEBPACK_IMPORTED_MODULE_10__.Show, {
        get when() {
          return gameIsRunning();
        },

        get children() {
          return (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_InGameUI__WEBPACK_IMPORTED_MODULE_7__.InGameUI, {});
        }

      }), (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(solid_js_web__WEBPACK_IMPORTED_MODULE_11__.Dynamic, {
        get component() {
          return options[activeMenu()];
        }

      }), (0,solid_js__WEBPACK_IMPORTED_MODULE_10__.createComponent)(_common_Pane3D__WEBPACK_IMPORTED_MODULE_3__.Pane3D, {
        onCanvasReady: onCanvasReady
      })];
    }

  });
};
const StyledApplication = solid_styled_components__WEBPACK_IMPORTED_MODULE_12__.styled.div`
  width: 100%;
  height: 100%;
  margin: 0;
`;

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
/* harmony import */ var solid_js_web__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! solid-js/web */ "./node_modules/solid-js/dist/dev.js");
/* harmony import */ var solid_styled_components__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! solid-styled-components */ "./node_modules/solid-styled-components/src/index.js");
/* harmony import */ var _common_Typography__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/Typography */ "./src/ts/ui/common/Typography.tsx");



const InGameUI = () => {
  return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_1__.createComponent)(StyledContainer, {
    get children() {
      return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_1__.createComponent)(StyledFooter, {
        get children() {
          return (0,solid_js_web__WEBPACK_IMPORTED_MODULE_1__.createComponent)(_common_Typography__WEBPACK_IMPORTED_MODULE_0__.Typography, {
            variant: "h2",
            children: "The Game Will End in 5 Seconds"
          });
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
  background: rgb(84 92 135);
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
  background-color: rgba(0, 0, 0, 0.5);
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

/***/ "./build/untouched.wasm":
/*!******************************!*\
  !*** ./build/untouched.wasm ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (__webpack_require__.p + "untouched.wasm");

/***/ }),

/***/ "./node_modules/@assemblyscript/loader/index.js":
/*!******************************************************!*\
  !*** ./node_modules/@assemblyscript/loader/index.js ***!
  \******************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "demangle": () => (/* binding */ demangle),
/* harmony export */   "instantiate": () => (/* binding */ instantiate),
/* harmony export */   "instantiateStreaming": () => (/* binding */ instantiateStreaming),
/* harmony export */   "instantiateSync": () => (/* binding */ instantiateSync)
/* harmony export */ });
// Runtime header offsets
const ID_OFFSET = -8;
const SIZE_OFFSET = -4;

// Runtime ids
const ARRAYBUFFER_ID = 0;
const STRING_ID = 1;
// const ARRAYBUFFERVIEW_ID = 2;

// Runtime type information
const ARRAYBUFFERVIEW = 1 << 0;
const ARRAY = 1 << 1;
const STATICARRAY = 1 << 2;
// const SET = 1 << 3;
// const MAP = 1 << 4;
const VAL_ALIGN_OFFSET = 6;
// const VAL_ALIGN = 1 << VAL_ALIGN_OFFSET;
const VAL_SIGNED = 1 << 11;
const VAL_FLOAT = 1 << 12;
// const VAL_NULLABLE = 1 << 13;
const VAL_MANAGED = 1 << 14;
// const KEY_ALIGN_OFFSET = 15;
// const KEY_ALIGN = 1 << KEY_ALIGN_OFFSET;
// const KEY_SIGNED = 1 << 20;
// const KEY_FLOAT = 1 << 21;
// const KEY_NULLABLE = 1 << 22;
// const KEY_MANAGED = 1 << 23;

// Array(BufferView) layout
const ARRAYBUFFERVIEW_BUFFER_OFFSET = 0;
const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
const ARRAYBUFFERVIEW_DATALENGTH_OFFSET = 8;
const ARRAYBUFFERVIEW_SIZE = 12;
const ARRAY_LENGTH_OFFSET = 12;
const ARRAY_SIZE = 16;

const BIGINT = typeof BigUint64Array !== "undefined";
const THIS = Symbol();

const STRING_DECODE_THRESHOLD = 32;
const decoder = new TextDecoder("utf-16le");

/** Gets a string from an U32 and an U16 view on a memory. */
function getStringImpl(buffer, ptr) {
  const len = new Uint32Array(buffer)[ptr + SIZE_OFFSET >>> 2] >>> 1;
  const arr = new Uint16Array(buffer, ptr, len);
  if (len <= STRING_DECODE_THRESHOLD) {
    return String.fromCharCode.apply(String, arr);
  }
  return decoder.decode(arr);
}

/** Prepares the base module prior to instantiation. */
function preInstantiate(imports) {
  const extendedExports = {};

  function getString(memory, ptr) {
    if (!memory) return "<yet unknown>";
    return getStringImpl(memory.buffer, ptr);
  }

  // add common imports used by stdlib for convenience
  const env = (imports.env = imports.env || {});
  env.abort = env.abort || function abort(msg, file, line, colm) {
    const memory = extendedExports.memory || env.memory; // prefer exported, otherwise try imported
    throw Error(`abort: ${getString(memory, msg)} at ${getString(memory, file)}:${line}:${colm}`);
  };
  env.trace = env.trace || function trace(msg, n, ...args) {
    const memory = extendedExports.memory || env.memory;
    console.log(`trace: ${getString(memory, msg)}${n ? " " : ""}${args.slice(0, n).join(", ")}`);
  };
  env.seed = env.seed || Date.now;
  imports.Math = imports.Math || Math;
  imports.Date = imports.Date || Date;

  return extendedExports;
}

const E_NOEXPORTRUNTIME = "Operation requires compiling with --exportRuntime";
const F_NOEXPORTRUNTIME = function() { throw Error(E_NOEXPORTRUNTIME); };

/** Prepares the final module once instantiation is complete. */
function postInstantiate(extendedExports, instance) {
  const exports = instance.exports;
  const memory = exports.memory;
  const table = exports.table;
  const __new = exports.__new || F_NOEXPORTRUNTIME;
  const __pin = exports.__pin || F_NOEXPORTRUNTIME;
  const __unpin = exports.__unpin || F_NOEXPORTRUNTIME;
  const __collect = exports.__collect || F_NOEXPORTRUNTIME;
  const __rtti_base = exports.__rtti_base;
  const getRttiCount = __rtti_base
    ? function (arr) { return arr[__rtti_base >>> 2]; }
    : F_NOEXPORTRUNTIME;

  extendedExports.__new = __new;
  extendedExports.__pin = __pin;
  extendedExports.__unpin = __unpin;
  extendedExports.__collect = __collect;

  /** Gets the runtime type info for the given id. */
  function getInfo(id) {
    const U32 = new Uint32Array(memory.buffer);
    const count = getRttiCount(U32);
    if ((id >>>= 0) >= count) throw Error(`invalid id: ${id}`);
    return U32[(__rtti_base + 4 >>> 2) + id * 2];
  }

  /** Gets and validate runtime type info for the given id for array like objects */
  function getArrayInfo(id) {
    const info = getInfo(id);
    if (!(info & (ARRAYBUFFERVIEW | ARRAY | STATICARRAY))) throw Error(`not an array: ${id}, flags=${info}`);
    return info;
  }

  /** Gets the runtime base id for the given id. */
  function getBase(id) {
    const U32 = new Uint32Array(memory.buffer);
    const count = getRttiCount(U32);
    if ((id >>>= 0) >= count) throw Error(`invalid id: ${id}`);
    return U32[(__rtti_base + 4 >>> 2) + id * 2 + 1];
  }

  /** Gets the runtime alignment of a collection's values. */
  function getValueAlign(info) {
    return 31 - Math.clz32((info >>> VAL_ALIGN_OFFSET) & 31); // -1 if none
  }

  /** Gets the runtime alignment of a collection's keys. */
  // function getKeyAlign(info) {
  //   return 31 - Math.clz32((info >>> KEY_ALIGN_OFFSET) & 31); // -1 if none
  // }

  /** Allocates a new string in the module's memory and returns its pointer. */
  function __newString(str) {
    if (str == null) return 0;
    const length = str.length;
    const ptr = __new(length << 1, STRING_ID);
    const U16 = new Uint16Array(memory.buffer);
    for (var i = 0, p = ptr >>> 1; i < length; ++i) U16[p + i] = str.charCodeAt(i);
    return ptr;
  }

  extendedExports.__newString = __newString;

  /** Reads a string from the module's memory by its pointer. */
  function __getString(ptr) {
    if (!ptr) return null;
    const buffer = memory.buffer;
    const id = new Uint32Array(buffer)[ptr + ID_OFFSET >>> 2];
    if (id !== STRING_ID) throw Error(`not a string: ${ptr}`);
    return getStringImpl(buffer, ptr);
  }

  extendedExports.__getString = __getString;

  /** Gets the view matching the specified alignment, signedness and floatness. */
  function getView(alignLog2, signed, float) {
    const buffer = memory.buffer;
    if (float) {
      switch (alignLog2) {
        case 2: return new Float32Array(buffer);
        case 3: return new Float64Array(buffer);
      }
    } else {
      switch (alignLog2) {
        case 0: return new (signed ? Int8Array : Uint8Array)(buffer);
        case 1: return new (signed ? Int16Array : Uint16Array)(buffer);
        case 2: return new (signed ? Int32Array : Uint32Array)(buffer);
        case 3: return new (signed ? BigInt64Array : BigUint64Array)(buffer);
      }
    }
    throw Error(`unsupported align: ${alignLog2}`);
  }

  /** Allocates a new array in the module's memory and returns its pointer. */
  function __newArray(id, values) {
    const info = getArrayInfo(id);
    const align = getValueAlign(info);
    const length = values.length;
    const buf = __new(length << align, info & STATICARRAY ? id : ARRAYBUFFER_ID);
    let result;
    if (info & STATICARRAY) {
      result = buf;
    } else {
      __pin(buf);
      const arr = __new(info & ARRAY ? ARRAY_SIZE : ARRAYBUFFERVIEW_SIZE, id);
      __unpin(buf);
      const U32 = new Uint32Array(memory.buffer);
      U32[arr + ARRAYBUFFERVIEW_BUFFER_OFFSET >>> 2] = buf;
      U32[arr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2] = buf;
      U32[arr + ARRAYBUFFERVIEW_DATALENGTH_OFFSET >>> 2] = length << align;
      if (info & ARRAY) U32[arr + ARRAY_LENGTH_OFFSET >>> 2] = length;
      result = arr;
    }
    const view = getView(align, info & VAL_SIGNED, info & VAL_FLOAT);
    if (info & VAL_MANAGED) {
      for (let i = 0; i < length; ++i) {
        const value = values[i];
        view[(buf >>> align) + i] = value;
      }
    } else {
      view.set(values, buf >>> align);
    }
    return result;
  }

  extendedExports.__newArray = __newArray;

  /** Gets a live view on an array's values in the module's memory. Infers the array type from RTTI. */
  function __getArrayView(arr) {
    const U32 = new Uint32Array(memory.buffer);
    const id = U32[arr + ID_OFFSET >>> 2];
    const info = getArrayInfo(id);
    const align = getValueAlign(info);
    let buf = info & STATICARRAY
      ? arr
      : U32[arr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2];
    const length = info & ARRAY
      ? U32[arr + ARRAY_LENGTH_OFFSET >>> 2]
      : U32[buf + SIZE_OFFSET >>> 2] >>> align;
    return getView(align, info & VAL_SIGNED, info & VAL_FLOAT).subarray(buf >>>= align, buf + length);
  }

  extendedExports.__getArrayView = __getArrayView;

  /** Copies an array's values from the module's memory. Infers the array type from RTTI. */
  function __getArray(arr) {
    const input = __getArrayView(arr);
    const len = input.length;
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = input[i];
    return out;
  }

  extendedExports.__getArray = __getArray;

  /** Copies an ArrayBuffer's value from the module's memory. */
  function __getArrayBuffer(ptr) {
    const buffer = memory.buffer;
    const length = new Uint32Array(buffer)[ptr + SIZE_OFFSET >>> 2];
    return buffer.slice(ptr, ptr + length);
  }

  extendedExports.__getArrayBuffer = __getArrayBuffer;

  /** Copies a typed array's values from the module's memory. */
  function getTypedArray(Type, alignLog2, ptr) {
    return new Type(getTypedArrayView(Type, alignLog2, ptr));
  }

  /** Gets a live view on a typed array's values in the module's memory. */
  function getTypedArrayView(Type, alignLog2, ptr) {
    const buffer = memory.buffer;
    const U32 = new Uint32Array(buffer);
    const bufPtr = U32[ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET >>> 2];
    return new Type(buffer, bufPtr, U32[bufPtr + SIZE_OFFSET >>> 2] >>> alignLog2);
  }

  /** Attach a set of get TypedArray and View functions to the exports. */
  function attachTypedArrayFunctions(ctor, name, align) {
    extendedExports[`__get${name}`] = getTypedArray.bind(null, ctor, align);
    extendedExports[`__get${name}View`] = getTypedArrayView.bind(null, ctor, align);
  }

  [
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array
  ].forEach(ctor => {
    attachTypedArrayFunctions(ctor, ctor.name, 31 - Math.clz32(ctor.BYTES_PER_ELEMENT));
  });

  if (BIGINT) {
    [BigUint64Array, BigInt64Array].forEach(ctor => {
      attachTypedArrayFunctions(ctor, ctor.name.slice(3), 3);
    });
  }

  /** Tests whether an object is an instance of the class represented by the specified base id. */
  function __instanceof(ptr, baseId) {
    const U32 = new Uint32Array(memory.buffer);
    let id = U32[ptr + ID_OFFSET >>> 2];
    if (id <= getRttiCount(U32)) {
      do {
        if (id == baseId) return true;
        id = getBase(id);
      } while (id);
    }
    return false;
  }

  extendedExports.__instanceof = __instanceof;

  // Pull basic exports to extendedExports so code in preInstantiate can use them
  extendedExports.memory = extendedExports.memory || memory;
  extendedExports.table  = extendedExports.table  || table;

  // Demangle exports and provide the usual utility on the prototype
  return demangle(exports, extendedExports);
}

function isResponse(src) {
  return typeof Response !== "undefined" && src instanceof Response;
}

function isModule(src) {
  return src instanceof WebAssembly.Module;
}

/** Asynchronously instantiates an AssemblyScript module from anything that can be instantiated. */
async function instantiate(source, imports = {}) {
  if (isResponse(source = await source)) return instantiateStreaming(source, imports);
  const module = isModule(source) ? source : await WebAssembly.compile(source);
  const extended = preInstantiate(imports);
  const instance = await WebAssembly.instantiate(module, imports);
  const exports = postInstantiate(extended, instance);
  return { module, instance, exports };
}

/** Synchronously instantiates an AssemblyScript module from a WebAssembly.Module or binary buffer. */
function instantiateSync(source, imports = {}) {
  const module = isModule(source) ? source : new WebAssembly.Module(source);
  const extended = preInstantiate(imports);
  const instance = new WebAssembly.Instance(module, imports);
  const exports = postInstantiate(extended, instance);
  return { module, instance, exports };
}

/** Asynchronously instantiates an AssemblyScript module from a response, i.e. as obtained by `fetch`. */
async function instantiateStreaming(source, imports = {}) {
  if (!WebAssembly.instantiateStreaming) {
    return instantiate(
      isResponse(source = await source)
        ? source.arrayBuffer()
        : source,
      imports
    );
  }
  const extended = preInstantiate(imports);
  const result = await WebAssembly.instantiateStreaming(source, imports);
  const exports = postInstantiate(extended, result.instance);
  return { ...result, exports };
}

/** Demangles an AssemblyScript module's exports to a friendly object structure. */
function demangle(exports, extendedExports = {}) {
  const setArgumentsLength = exports["__argumentsLength"]
    ? length => { exports["__argumentsLength"].value = length; }
    : exports["__setArgumentsLength"] || exports["__setargc"] || (() => { /* nop */ });
  for (let internalName in exports) {
    if (!Object.prototype.hasOwnProperty.call(exports, internalName)) continue;
    const elem = exports[internalName];
    let parts = internalName.split(".");
    let curr = extendedExports;
    while (parts.length > 1) {
      let part = parts.shift();
      if (!Object.prototype.hasOwnProperty.call(curr, part)) curr[part] = {};
      curr = curr[part];
    }
    let name = parts[0];
    let hash = name.indexOf("#");
    if (hash >= 0) {
      const className = name.substring(0, hash);
      const classElem = curr[className];
      if (typeof classElem === "undefined" || !classElem.prototype) {
        const ctor = function(...args) {
          return ctor.wrap(ctor.prototype.constructor(0, ...args));
        };
        ctor.prototype = {
          valueOf() { return this[THIS]; }
        };
        ctor.wrap = function(thisValue) {
          return Object.create(ctor.prototype, { [THIS]: { value: thisValue, writable: false } });
        };
        if (classElem) Object.getOwnPropertyNames(classElem).forEach(name =>
          Object.defineProperty(ctor, name, Object.getOwnPropertyDescriptor(classElem, name))
        );
        curr[className] = ctor;
      }
      name = name.substring(hash + 1);
      curr = curr[className].prototype;
      if (/^(get|set):/.test(name)) {
        if (!Object.prototype.hasOwnProperty.call(curr, name = name.substring(4))) {
          let getter = exports[internalName.replace("set:", "get:")];
          let setter = exports[internalName.replace("get:", "set:")];
          Object.defineProperty(curr, name, {
            get() { return getter(this[THIS]); },
            set(value) { setter(this[THIS], value); },
            enumerable: true
          });
        }
      } else {
        if (name === 'constructor') {
          (curr[name] = (...args) => {
            setArgumentsLength(args.length);
            return elem(...args);
          }).original = elem;
        } else { // instance method
          (curr[name] = function(...args) { // !
            setArgumentsLength(args.length);
            return elem(this[THIS], ...args);
          }).original = elem;
        }
      }
    } else {
      if (/^(get|set):/.test(name)) {
        if (!Object.prototype.hasOwnProperty.call(curr, name = name.substring(4))) {
          Object.defineProperty(curr, name, {
            get: exports[internalName.replace("set:", "get:")],
            set: exports[internalName.replace("get:", "set:")],
            enumerable: true
          });
        }
      } else if (typeof elem === "function" && elem !== setArgumentsLength) {
        (curr[name] = (...args) => {
          setArgumentsLength(args.length);
          return elem(...args);
        }).original = elem;
      } else {
        curr[name] = elem;
      }
    }
  }
  return extendedExports;
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  instantiate,
  instantiateSync,
  instantiateStreaming,
  demangle
});


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
/* harmony export */   "glob": () => (/* binding */ g),
/* harmony export */   "keyframes": () => (/* binding */ b),
/* harmony export */   "setup": () => (/* binding */ h),
/* harmony export */   "styled": () => (/* binding */ m)
/* harmony export */ });
let e={data:""},t=t=>"object"==typeof window?((t?t.querySelector("#_goober"):window._goober)||Object.assign((t||document.head).appendChild(document.createElement("style")),{innerHTML:" ",id:"_goober"})).firstChild:t||e,r=e=>{let r=t(e),l=r.data;return r.data="",l},l=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,a=/\/\*[^]*?\*\/|\s\s+|\n/g,n=(e,t)=>{let r="",l="",a="";for(let o in e){let s=e[o];"@"==o[0]?"i"==o[1]?r=o+" "+s+";":l+="f"==o[1]?n(s,o):o+"{"+n(s,"k"==o[1]?"":t)+"}":"object"==typeof s?l+=n(s,t?t.replace(/([^,])+/g,e=>o.replace(/(^:.*)|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):o):null!=s&&(o=/^--/.test(o)?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),a+=n.p?n.p(o,s):o+":"+s+";")}return r+(t&&a?t+"{"+a+"}":a)+l},o={},s=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+s(e[r]);return t}return e},c=(e,t,r,c,i)=>{let u=s(e),p=o[u]||(o[u]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(u));if(!o[p]){let t=u!==e?e:(e=>{let t,r=[{}];for(;t=l.exec(e.replace(a,""));)t[4]?r.shift():t[3]?r.unshift(r[0][t[3]]=r[0][t[3]]||{}):r[0][t[1]]=t[2];return r[0]})(e);o[p]=n(i?{["@keyframes "+p]:t}:t,r?"":"."+p)}return((e,t,r)=>{-1==t.data.indexOf(e)&&(t.data=r?e+t.data:t.data+e)})(o[p],t,c),p},i=(e,t,r)=>e.reduce((e,l,a)=>{let o=t[a];if(o&&o.call){let e=o(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;o=t?"."+t:e&&"object"==typeof e?e.props?"":n(e,""):!1===e?"":e}return e+l+(null==o?"":o)},"");function u(e){let r=this||{},l=e.call?e(r.p):e;return c(l.unshift?l.raw?i(l,[].slice.call(arguments,1),r.p):l.reduce((e,t)=>Object.assign(e,t&&t.call?t(r.p):t),{}):l,t(r.target),r.g,r.o,r.k)}let p,d,f,g=u.bind({g:1}),b=u.bind({k:1});function h(e,t,r,l){n.p=t,p=e,d=r,f=l}function m(e,t){let r=this||{};return function(){let l=arguments;function a(n,o){let s=Object.assign({},n),c=s.className||a.className;r.p=Object.assign({theme:d&&d()},s),r.o=/ *go\d+/.test(c),s.className=u.apply(r,l)+(c?" "+c:""),t&&(s.ref=o);let i=e;return e[0]&&(i=s.as||e,delete s.as),f&&i[0]&&f(s),p(i,s)}return t?t(a):a}}


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