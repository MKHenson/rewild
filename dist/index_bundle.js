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

/***/ "./node_modules/@assemblyscript/loader/index.js":
/*!******************************************************!*\
  !*** ./node_modules/@assemblyscript/loader/index.js ***!
  \******************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "instantiate": () => (/* binding */ instantiate),
/* harmony export */   "instantiateSync": () => (/* binding */ instantiateSync),
/* harmony export */   "instantiateStreaming": () => (/* binding */ instantiateStreaming),
/* harmony export */   "demangle": () => (/* binding */ demangle),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
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
var Commands;
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
var GPUCommands;
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
var GroupType;
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
var PipelineType;
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
var ResourceType;
(function (ResourceType) {
    ResourceType[ResourceType["Transform"] = 0] = "Transform";
    ResourceType[ResourceType["Material"] = 1] = "Material";
    ResourceType[ResourceType["Lighting"] = 2] = "Lighting";
    ResourceType[ResourceType["Texture"] = 3] = "Texture";
})(ResourceType || (ResourceType = {}));


/***/ }),

/***/ "./src/ts/AppBindings.ts":
/*!*******************************!*\
  !*** ./src/ts/AppBindings.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "vaos": () => (/* binding */ vaos),
/* harmony export */   "buffers": () => (/* binding */ buffers),
/* harmony export */   "bindExports": () => (/* binding */ bindExports),
/* harmony export */   "createBindingsGPU": () => (/* binding */ createBindingsGPU)
/* harmony export */ });
const vaos = [];
const buffers = [];
let wasmExports;
let wasmArrayBuffer, wasmDataView, wasmMemoryBlock;
function bindExports(exports) {
    wasmExports = exports;
    wasmMemoryBlock = wasmExports.exports.memory.buffer;
    wasmArrayBuffer = new Uint32Array(wasmMemoryBlock);
    wasmDataView = new DataView(exports.exports.memory.buffer);
    wasmDataView;
}
function createBindingsGPU(importObject, gameManager) {
    if (!importObject.env.memory)
        throw new Error("You need to set memory in your importObject");
    const binding = {
        print(stringIndex) {
            if (wasmExports)
                console.log(wasmExports.exports.__getString(stringIndex));
        },
        createBufferFromF32(data, usage) {
            const buffer = wasmExports.exports.__getFloat32Array(data);
            return gameManager.createBufferF32(buffer, usage);
        },
        createIndexBuffer(data, usage) {
            const buffer = wasmExports.exports.__getUint32Array(data);
            return gameManager.createIndexBuffer(buffer, usage);
        },
        render(commandsIndex) {
            const commandBuffer = wasmExports.exports.__getArray(commandsIndex);
            gameManager.renderQueueManager.run(commandBuffer, wasmArrayBuffer, wasmMemoryBlock);
        },
    };
    importObject.Imports = binding;
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
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};








const meshPipelineInstances = [];
class GameManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.buffers = [];
        this.textures = [];
        this.samplers = [];
        this.disposed = false;
        this.currentPass = null;
        this.renderQueueManager = new _RenderQueueManager__WEBPACK_IMPORTED_MODULE_4__.RenderQueueManager(this);
        this.onResizeHandler = this.onWindowResize.bind(this);
        this.onFrameHandler = this.onFrame.bind(this);
    }
    init(wasm) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            this.wasm = wasm;
            const hasGPU = this.hasWebGPU();
            if (!hasGPU)
                throw new Error("Your current browser does not support WebGPU!");
            this.inputManager = new _InputManager__WEBPACK_IMPORTED_MODULE_0__.InputManager(this.canvas, wasm);
            const adapter = yield ((_a = navigator.gpu) === null || _a === void 0 ? void 0 : _a.requestAdapter());
            const device = (yield (adapter === null || adapter === void 0 ? void 0 : adapter.requestDevice()));
            const context = this.canvas.getContext("webgpu");
            const format = context.getPreferredFormat(adapter);
            context.configure({
                device: device,
                format: format,
                size: this.canvasSize(),
            });
            this.device = device;
            this.context = context;
            this.format = format;
            this.samplers = [
                device.createSampler({
                    minFilter: "linear",
                    magFilter: "linear",
                }),
            ];
            // TEXTURES
            const texturePaths = [
                { name: "grid", path: "./media/uv-grid.jpg" },
                { name: "crate", path: "./media/crate-wooden.jpg" },
            ];
            this.textures = yield Promise.all(texturePaths.map((tp, index) => {
                const texture = new _Texture__WEBPACK_IMPORTED_MODULE_5__.Texture(tp.name, tp.path);
                wasm.TextureFactory.createTexture(wasm.__newString(tp.name), index);
                return texture.load(device);
            }));
            // PIPELINES
            this.pipelines = [
                new _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__.DebugPipeline("textured", { diffuseMap: this.textures[1], NUM_DIR_LIGHTS: 0 }),
                new _pipelines_debug_pipeline__WEBPACK_IMPORTED_MODULE_2__.DebugPipeline("simple", { NUM_DIR_LIGHTS: 0 }),
            ];
            const sampleCount = 4;
            this.renderTarget = device.createTexture({
                size: this.canvasSize(),
                sampleCount,
                format: format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.renderTargetView = this.renderTarget.createView();
            this.depthTexture = device.createTexture({
                size: this.canvasSize(),
                format: "depth24plus",
                sampleCount: sampleCount,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            // Initialize the wasm module
            wasm.AsSceneManager.init(this.canvas.width, this.canvas.height);
            this.initRuntime();
            // Setup events
            window.addEventListener("resize", this.onResizeHandler);
            window.requestAnimationFrame(this.onFrameHandler);
            window.addEventListener("click", (e) => {
                const pipelines = this.pipelines;
                pipelines.forEach((p) => {
                    if (p.defines.diffuseMap) {
                        delete p.defines.diffuseMap;
                        p.defines = p.defines;
                    }
                    else {
                        p.defines.diffuseMap = this.textures[1];
                        p.defines = p.defines;
                    }
                });
            });
        });
    }
    getTexture(name) {
        return this.textures.find((t) => t.name === name) || null;
    }
    initRuntime() {
        const wasm = this.wasm;
        const runime = wasm.Runtime.wrap(wasm.AsSceneManager.getRuntime());
        this.pipelines.forEach((p) => {
            p.build(this);
            p.initialize(this);
        });
        const containerPtr = wasm.__pin(wasm.createLevel1());
        const container = wasm.Level1.wrap(containerPtr);
        container.addAsset(this.createMesh(1, "sphere", false));
        container.addAsset(this.createMesh(1, "box", true));
        container.addAsset(this.createMesh(1, "box", true));
        wasm.__unpin(containerPtr);
        runime.addContainer(containerPtr);
    }
    createMesh(size, type, useTexture = true) {
        // Get the pipeline
        const debugPipeline = this.getPipeline(useTexture ? "textured" : "simple");
        const pipelineIndex = this.pipelines.indexOf(debugPipeline);
        // Create an instance in WASM
        const pipelineInsPtr = this.wasm.PipelineFactory.createPipeline(this.wasm.__newString(debugPipeline.name), pipelineIndex, _common_PipelineType__WEBPACK_IMPORTED_MODULE_1__.PipelineType.Mesh);
        const meshPipelineIns = this.wasm.MeshPipeline.wrap(pipelineInsPtr);
        meshPipelineInstances.push(meshPipelineIns);
        // Assign a transform buffer to the intance
        meshPipelineIns.transformGroupId = debugPipeline.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_7__.ResourceType.Transform).template.group;
        meshPipelineIns.transformResourceIndex = debugPipeline.addResourceInstance(this, _common_GroupType__WEBPACK_IMPORTED_MODULE_6__.GroupType.Transform);
        const geometryPtr = type === "box" ? this.wasm.GeometryFactory.createBox(size) : this.wasm.GeometryFactory.createSphere(size);
        const meshPtr = this.wasm.createMesh(geometryPtr, pipelineInsPtr);
        return meshPtr;
    }
    dispose() {
        var _a;
        this.disposed = true;
        window.removeEventListener("resize", this.onResizeHandler);
        (_a = this.inputManager) === null || _a === void 0 ? void 0 : _a.dispose();
    }
    // TODO:
    onWindowResize() {
        this.wasm.AsSceneManager.resize(this.canvas.width, this.canvas.height);
    }
    onFrame() {
        if (this.disposed)
            return;
        this.wasm.AsSceneManager.update(performance.now());
        window.requestAnimationFrame(this.onFrameHandler);
    }
    canvasSize() {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const size = [this.canvas.clientWidth * devicePixelRatio, this.canvas.clientHeight * devicePixelRatio];
        return size;
    }
    hasWebGPU() {
        if (!navigator.gpu) {
            return false;
        }
        else {
            return true;
        }
    }
    getPipeline(name) {
        return this.pipelines.find((p) => p.name === name);
    }
    startPass() {
        const device = this.device;
        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.renderTargetView,
                    resolveTarget: this.context.getCurrentTexture().createView(),
                    loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthLoadValue: 1,
                depthStoreOp: "store",
                stencilLoadValue: 0,
                stencilStoreOp: "store",
            },
        });
        this.currentPass = renderPass;
        this.currentCommandEncoder = commandEncoder;
    }
    endPass() {
        this.currentPass.endPass();
        this.device.queue.submit([this.currentCommandEncoder.finish()]);
    }
    createBufferF32(data, usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
        const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createBuffer)(this.device, data, usageFlag);
        this.buffers.push(buffer);
        return this.buffers.length - 1;
    }
    createIndexBuffer(data, usageFlag = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
        const buffer = (0,_Utils__WEBPACK_IMPORTED_MODULE_3__.createIndexBuffer)(this.device, data, usageFlag);
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
/* harmony export */   "MouseEventType": () => (/* binding */ MouseEventType),
/* harmony export */   "InputManager": () => (/* binding */ InputManager)
/* harmony export */ });
var MouseEventType;
(function (MouseEventType) {
    MouseEventType[MouseEventType["MouseDown"] = 0] = "MouseDown";
    MouseEventType[MouseEventType["MouseUp"] = 1] = "MouseUp";
    MouseEventType[MouseEventType["MouseMove"] = 2] = "MouseMove";
    MouseEventType[MouseEventType["MouseWheel"] = 3] = "MouseWheel";
})(MouseEventType || (MouseEventType = {}));
class InputManager {
    constructor(canvas, wasm) {
        this.wasm = wasm;
        this.canvas = canvas;
        this.canvasBounds = canvas.getBoundingClientRect();
        this.onDownHandler = this.onDown.bind(this);
        this.onUpHandler = this.onUp.bind(this);
        this.onMoveHandler = this.onMove.bind(this);
        this.onWheelHandler = this.onWheel.bind(this);
        this.canvas.addEventListener("mousedown", this.onDownHandler);
        window.addEventListener("wheel", this.onWheelHandler);
        window.addEventListener("mouseup", this.onUpHandler);
        window.addEventListener("mousemove", this.onMoveHandler);
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
    onWheel(e) {
        this.sendMouseEvent(MouseEventType.MouseWheel, e, this.canvasBounds, e.deltaY);
    }
    createMouseEvent(e, bounds, delta = 0) {
        const mouseEventPtr = this.wasm.__pin(this.wasm.ASInputManager.createMouseEvent(e.clientX, e.clientY, e.pageX, e.pageY, e.ctrlKey, e.shiftKey, e.altKey, e.button, e.buttons, bounds.x, bounds.y, bounds.width, bounds.height, delta));
        this.wasm.ASInputManager.MouseEvent.wrap(mouseEventPtr);
        return mouseEventPtr;
    }
    sendMouseEvent(type, event, bounds, delta) {
        const manager = this.wasm.ASInputManager.InputManager.wrap(this.wasm.ASInputManager.getInputManager());
        const wasmEvent = this.createMouseEvent(event, bounds, delta);
        if (type === MouseEventType.MouseUp)
            manager.onMouseUp(wasmEvent);
        else if (type === MouseEventType.MouseMove)
            manager.onMouseMove(wasmEvent);
        else if (type === MouseEventType.MouseDown)
            manager.onMouseDown(wasmEvent);
        else if (type === MouseEventType.MouseWheel)
            manager.onWheel(wasmEvent);
        this.wasm.__unpin(wasmEvent);
    }
    dispose() {
        this.canvas.removeEventListener("mousedown", this.onDownHandler);
        window.removeEventListener("wheel", this.onWheelHandler);
        window.removeEventListener("mouseup", this.onUpHandler);
        window.removeEventListener("mousemove", this.onMoveHandler);
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
    constructor(manager) {
        this.manager = manager;
    }
    run(commandBuffer, arrayBuffer, wasmMemoryBlock) {
        const manager = this.manager;
        const device = manager.device;
        const getPtrIndex = function (ptr) {
            return arrayBuffer[(ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
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
                        this.manager.pipelines.forEach((p) => {
                            if (p.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_1__.ResourceType.Material)) {
                                p.defines = Object.assign(Object.assign({}, p.defines), { NUM_DIR_LIGHTS: numDirectionLights });
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
                    const mat3x3 = new Float32Array(wasmMemoryBlock, normMatrixPtr, 9);
                    // TODO: Make this neater
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
                    const instance = instances === null || instances === void 0 ? void 0 : instances[commandBuffer[i + 2]];
                    if (instance)
                        pass.setBindGroup(instance.group, instance.bindGroup);
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
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Texture {
    constructor(name, path) {
        this.name = name;
        this.path = path;
    }
    load(device) {
        return __awaiter(this, void 0, void 0, function* () {
            let gpuTexture;
            const img = document.createElement("img");
            img.src = this.path;
            yield img.decode();
            this.imageData = yield createImageBitmap(img);
            gpuTexture = device.createTexture({
                size: [this.imageData.width, this.imageData.height, 1],
                format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });
            device.queue.copyExternalImageToTexture({ source: this.imageData }, { texture: gpuTexture }, [
                this.imageData.width,
                this.imageData.height,
            ]);
            this.gpuTexture = gpuTexture;
            return this;
        });
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
function createBuffer(device, data, usageFlag = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
    const buffer = device.createBuffer({
        size: data.byteLength,
        usage: usageFlag,
        // mappedAtCreation is true so we can interact with it via the CPU
        mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
}
function createIndexBuffer(device, data, usageFlag = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
    const buffer = device.createBuffer({
        size: data.byteLength,
        usage: usageFlag,
        // mappedAtCreation is true so we can interact with it via the CPU
        mappedAtCreation: true,
    });
    new Uint32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
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
        frontFace: "ccw",
    },
    depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
    },
    multisample: {
        count: 4,
    },
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
        if (this.groupMapping.has(type))
            return this.groupMapping.get(type).index;
        else {
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
        }
        else {
            const groupMapping = new GroupMapping(this.groups);
            this.groupMapping.set(type, groupMapping);
            this.groups++;
            return groupMapping.getBinding();
        }
    }
    getTemplateByType(type, id) {
        if (id)
            return this.resourceTemplates.find((t) => t.resourceType === type && id === t.id);
        else
            return this.resourceTemplates.find((t) => t.resourceType === type);
    }
    getTemplateByGroup(type) {
        return this.resourceTemplates.find((t) => t.groupType === type);
    }
    addTemplate(template) {
        this.resourceTemplates.push(template);
        return this;
    }
    build(gameManager) {
        this.rebuild = false;
        const groupInstanceMap = this.groupInstances;
        const templates = this.resourceTemplates;
        // Destroy previous instances
        templates.forEach((template) => {
            const resourceInstances = groupInstanceMap.get(template.groupType);
            resourceInstances === null || resourceInstances === void 0 ? void 0 : resourceInstances.forEach((i) => {
                i.dispose();
            });
        });
        // Reset
        templates.splice(0, templates.length);
        this.groupMapping.clear();
        this.groups = 0;
        this.onAddResources();
        let curBinding = 0;
        const binds = new Map();
        templates.forEach((resourceTemplate) => {
            const groupIndex = this.groupIndex(resourceTemplate.groupType);
            if (!binds.has(groupIndex))
                binds.set(groupIndex, 0);
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
        const uniqueNewGroupKeys = templates
            .map((r) => r.groupType)
            .filter((value, index, self) => self.indexOf(value) === index);
        const groupCache = new Map();
        // Remove any unused instances
        prevGroupKeys.forEach((key) => {
            if (!uniqueNewGroupKeys.includes(key))
                groupInstances.delete(key);
        });
        // Initialize temp cache maps
        for (const newKey of uniqueNewGroupKeys) {
            let numInstancesToCreate = 0;
            let instances;
            // If we previously had instances, then save the number of them
            // as we have to re-create the same amount as before. Otherwise just create 1;
            if (groupInstances.has(newKey)) {
                instances = groupInstances.get(newKey);
                numInstancesToCreate = instances.length;
                instances.splice(0, instances.length);
            }
            else {
                numInstancesToCreate = 1;
                instances = [];
                groupInstances.set(newKey, instances);
            }
            groupCache.set(newKey, { bindData: new Map(), numInstances: numInstancesToCreate });
        }
        // Initialize each template
        templates.forEach((resourceTemplate) => {
            const { bindData, numInstances } = groupCache.get(resourceTemplate.groupType);
            for (let i = 0; i < numInstances; i++)
                if (bindData.has(i)) {
                    bindData.get(i).push(resourceTemplate.getBindingData(gameManager, this.renderPipeline));
                }
                else {
                    bindData.set(i, [resourceTemplate.getBindingData(gameManager, this.renderPipeline)]);
                }
        });
        // Create the instances & bind groups
        groupCache.forEach((cache, groupType) => {
            const instances = new Array(cache.numInstances);
            const groupIndex = this.groupIndex(groupType);
            for (let i = 0; i < cache.numInstances; i++) {
                let buffers = null;
                // Join all the entries from each template
                // Also join all the collect each of the buffers we want to cache for the render queue
                const entries = cache.bindData.get(i).reduce((accumulator, cur) => {
                    if (cur.buffer) {
                        if (!buffers)
                            buffers = [cur.buffer];
                        else
                            buffers.push(cur.buffer);
                    }
                    accumulator.push(...cur.binds);
                    return accumulator;
                }, []);
                const bindGroup = gameManager.device.createBindGroup({
                    label: _common_GroupType__WEBPACK_IMPORTED_MODULE_1__.GroupType[groupType],
                    layout: this.renderPipeline.getBindGroupLayout(groupIndex),
                    entries,
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
                entries: bindingData.binds,
            });
            const instances = new _resources_PipelineResourceInstance__WEBPACK_IMPORTED_MODULE_0__.PipelineResourceInstance(groupIndex, bindGroup, bindingData.buffer ? [bindingData.buffer] : null);
            const instanceArray = this.groupInstances.get(type);
            instanceArray.push(instances);
            return instanceArray.length - 1;
        }
        else
            throw new Error("Pipeline does not use resource type");
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
const vertexShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shader `
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Transform).template.vertexBlock}

struct Output {
    [[builtin(position)]] Position : vec4<f32>;
    [[location(0)]] vFragUV : vec2<f32>;
    [[location(1)]] vNormal : vec3<f32>;
    [[location(2)]] vViewPosition : vec3<f32>;
};

[[stage(vertex)]]
fn main([[location(0)]] pos: vec4<f32>, [[location(1)]] norm: vec3<f32>, [[location(2)]] uv: vec2<f32>) -> Output {
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
`;
// prettier-ignore
const fragmentShader = _shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shader `

${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Lighting).template.fragmentBlock}
${e => e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Material).template.fragmentBlock}
${e => e.defines.diffuseMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Texture, 'diffuse').template.fragmentBlock : ''}
${e => e.defines.normalMap ? e.getTemplateByType(_common_ResourceType__WEBPACK_IMPORTED_MODULE_0__.ResourceType.Texture, 'normal').template.fragmentBlock : ''}

// INTERNAL STRUCTS
struct IncidentLight {
  color: vec3<f32>;
  direction: vec3<f32>;
  visible: bool;
};

struct ReflectedLight {
  directDiffuse: vec3<f32>;
  directSpecular: vec3<f32>;
  indirectDiffuse: vec3<f32>;
  indirectSpecular: vec3<f32>;
};

struct PhysicalMaterial {
  diffuseColor: vec3<f32>;
  specularColor: vec3<f32>;
  roughness: f32;
  specularF90: f32;
};

struct GeometricContext {
  position: vec3<f32>;
  normal: vec3<f32>;
  viewDir: vec3<f32>;
};

struct DirectionalLight {
  direction: vec3<f32>;
  color: vec3<f32>;
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

[[stage(fragment)]]
fn main(
  [[location(0)]] vFragUV: vec2<f32>,
  [[location(1)]] vNormal : vec3<f32>,
  [[location(2)]] vViewPosition : vec3<f32>
) -> [[location(0)]] vec4<f32> {

  var normal = normalize( vNormal );
  var geometryNormal = normal;

  var totalEmissiveRadiance: vec3<f32> = materialData.emissive.xyz;
  var diffuseColor = vec4<f32>( materialData.diffuse.xyz, materialData.opacity );
  var reflectedLight: ReflectedLight = ReflectedLight( vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ), vec3<f32>( 0.0 ) );

  ${e => e.defines.diffuseMap &&
    `var texelColor = textureSample(diffuseTexture, diffuseSampler, vFragUV);
  diffuseColor = diffuseColor * texelColor;`}

  // TODO: Alpha test - discard early

  // Metalness
  var metalnessFactor: f32 = materialData.metalness;
  // TODO:
  ${e => e.defines.metalnessMap &&
    `vec4 texelMetalness = = textureSample(metalnessMap, mySampler, vFragUV);
    metalnessFactor *= texelMetalness.b;`}

  // Roughness
  var roughnessFactor: f32 = materialData.roughness;
  // TODO:
  ${e => e.defines.roughnessMap &&
    `vec4 texelRoughness = textureSample(roughnessMap, mySampler, vFragUV);
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
        super.build(gameManager);
        // Build the shaders - should go after adding the resources as we might use those in the shader source
        const vertSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shaderBuilder)(this.vertexSource, this);
        const fragSource = (0,_shader_lib_Utils__WEBPACK_IMPORTED_MODULE_8__.shaderBuilder)(this.fragmentSource, this);
        this.renderPipeline = gameManager.device.createRenderPipeline(Object.assign(Object.assign({}, _DefaultPipelineDescriptor__WEBPACK_IMPORTED_MODULE_1__.defaultPipelineDescriptor), { label: "Debug Pipeline", vertex: {
                module: gameManager.device.createShaderModule({
                    code: vertSource,
                }),
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
                        attributes: [
                            {
                                shaderLocation: 0,
                                format: "float32x3",
                                offset: 0,
                            },
                            // {
                            //   shaderLocation: 1,
                            //   format: "float32x3",
                            //   offset: 12,
                            // },
                        ],
                    },
                    {
                        arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
                        attributes: [
                            {
                                shaderLocation: 1,
                                format: "float32x3",
                                offset: 0,
                            },
                        ],
                    },
                    {
                        arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
                        attributes: [
                            {
                                shaderLocation: 2,
                                format: "float32x2",
                                offset: 0,
                            },
                        ],
                    },
                ],
            }, fragment: {
                module: gameManager.device.createShaderModule({
                    code: fragSource,
                }),
                entryPoint: "main",
                targets: [{ format: gameManager.format }],
            } }));
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
                mappedAtCreation: true,
            });
            LightingResource.sceneLightingBuffer = manager.device.createBuffer({
                label: "sceneLightingBuffer",
                size: SCENE_LIGHTING_BUFFER,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true,
            });
            // Defaults for lighting info
            // prettier-ignore
            const lightInofoDefaults = new Uint32Array([
                0, // Num Directional lights
            ]);
            // Defaults for scene lights buffer
            // prettier-ignore
            const sceneLightingBufferDefaults = new Float32Array([
                0.4, 0.4, 0.4, 0, // Ambient Light Color
            ]);
            // Set defaults
            new Float32Array(LightingResource.lightingConfig.getMappedRange()).set(lightInofoDefaults);
            LightingResource.lightingConfig.unmap();
            new Float32Array(LightingResource.sceneLightingBuffer.getMappedRange()).set(sceneLightingBufferDefaults);
            LightingResource.sceneLightingBuffer.unmap();
        }
        if (LightingResource.rebuildDirectionLights && LightingResource.numDirLights > 0) {
            LightingResource.rebuildDirectionLights = false;
            if (LightingResource.directionLightsBuffer)
                LightingResource.directionLightsBuffer.destroy();
            LightingResource.directionLightsBuffer = manager.device.createBuffer({
                label: "dirLightsBuffer",
                size: _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["vec4<f32>"] * 2 * LightingResource.numDirLights,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }
        // prettier-ignore
        return {
            group,
            bindings: [{ buffer: LightingResource.lightingConfig, }, { buffer: LightingResource.sceneLightingBuffer },
            ].concat(LightingResource.numDirLights ? { buffer: LightingResource.directionLightsBuffer } : []),
            fragmentBlock: `struct SceneLightingUniform {
        ambientLightColor: vec4<f32>;
      };

      struct LightingConfigUniform {
        numDirectionalLights: u32;
      };

      [[group(${group}), binding(${this.lightingConfigBinding})]] var<uniform> lightingConfigUniform: LightingConfigUniform;
      [[group(${group}), binding(${this.sceneLightingBinding})]] var<uniform> sceneLightingUniform: SceneLightingUniform;


      ${pipeline.defines.NUM_DIR_LIGHTS ? `
      struct DirectionLightUniform {
        direction : vec4<f32>;
        color : vec4<f32>;
      };

      struct DirectionLightsUniform {
        directionalLights: array<DirectionLightUniform>;
      };

      [[group(${group}), binding(${this.directionLightBinding})]] var<storage, read> directionLightsUniform: DirectionLightsUniform;
      ` : ''}
      `,
            vertexBlock: null,
        };
    }
    getBindingData(manager, pipeline) {
        return {
            binds: [
                {
                    binding: this.lightingConfigBinding,
                    resource: {
                        buffer: LightingResource.lightingConfig,
                    },
                },
                {
                    binding: this.sceneLightingBinding,
                    resource: {
                        buffer: LightingResource.sceneLightingBuffer,
                    },
                },
            ].concat(LightingResource.numDirLights
                ? {
                    binding: this.directionLightBinding,
                    resource: {
                        buffer: LightingResource.directionLightsBuffer,
                    },
                }
                : []),
            buffer: null,
        };
    }
}
LightingResource.numDirLights = 0;
LightingResource.rebuildDirectionLights = true;


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
        const group = pipeline.groupIndex(this.groupType);
        // prettier-ignore
        const initialValues = new Float32Array([
            1, 1, 1, 0,
            0.1, 0.1, 0.1, 0,
            1,
            0,
            0.5 // Roughness
        ]);
        const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;
        const buffer = manager.device.createBuffer({
            label: "materialData",
            size: SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        // Set defaults
        new Float32Array(buffer.getMappedRange()).set(initialValues);
        buffer.unmap();
        const resource = {
            buffer: buffer,
            offset: 0,
            size: SIZE,
        };
        return {
            group,
            bindings: [resource],
            // prettier-ignore
            fragmentBlock: `
      struct MaterialData {
        diffuse: vec4<f32>;
        emissive: vec4<f32>;
        opacity: f32;
        metalness: f32;
        roughness: f32;
      };

      [[group(${group}), binding(${curBindIndex})]] var<uniform> materialData: MaterialData;
      `,
            vertexBlock: null,
        };
    }
    getBindingData(manager, pipeline) {
        // prettier-ignore
        const initialValues = new Float32Array([
            1, 1, 1, 0,
            0.1, 0.1, 0.1, 0,
            1,
            0,
            0.5 // Roughness
        ]);
        const SIZE = Float32Array.BYTES_PER_ELEMENT * initialValues.length;
        const buffer = manager.device.createBuffer({
            label: "materialData",
            size: SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        // Set defaults
        new Float32Array(buffer.getMappedRange()).set(initialValues);
        buffer.unmap();
        const resource = {
            buffer: buffer,
            offset: 0,
            size: SIZE,
        };
        return {
            binds: [
                {
                    binding: this.binding,
                    resource,
                },
            ],
            buffer,
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
    u16: 1 * Uint16Array.BYTES_PER_ELEMENT,
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
    constructor(group, bindGroup, buffer = null) {
        this.group = group;
        this.bindGroup = bindGroup;
        this.buffers = buffer;
    }
    dispose() {
        if (this.buffers)
            this.buffers.forEach((b) => b.destroy());
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
        const group = pipeline.groupIndex(this.groupType);
        // prettier-ignore
        return {
            group,
            bindings: [manager.samplers[0], this.texture.gpuTexture.createView()],
            fragmentBlock: `
      ${pipeline.defines.diffuseMap && `
      [[group(${group}), binding(${this.samplerBind})]] var ${this.id}Sampler: sampler;
      [[group(${group}), binding(${this.textureBind})]] var ${this.id}Texture: texture_2d<f32>;`}`,
            vertexBlock: null,
        };
    }
    getBindingData(manager, pipeline) {
        return {
            binds: [
                {
                    binding: this.samplerBind,
                    resource: manager.samplers[0],
                },
                {
                    binding: this.textureBind,
                    resource: this.texture.gpuTexture.createView(),
                },
            ],
            buffer: null,
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
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        return {
            group,
            bindings: [
                {
                    buffer,
                },
            ],
            fragmentBlock: null,
            // prettier-ignore
            vertexBlock: `
      struct TransformUniform {
        projMatrix: mat4x4<f32>;
        modelViewMatrix: mat4x4<f32>;
        normalMatrix: mat3x3<f32>;
      };
      [[group(${group}), binding(${curBindIndex})]] var<uniform> uniforms: TransformUniform;
      `,
        };
    }
    getBindingData(manager, pipeline) {
        const SIZEOF_MATRICES = _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + _MemoryUtils__WEBPACK_IMPORTED_MODULE_0__.UNIFORM_TYPES_MAP["mat3x3<f32>"];
        const buffer = manager.device.createBuffer({
            label: "transform",
            size: SIZEOF_MATRICES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        return {
            binds: [
                {
                    binding: this.binding,
                    resource: {
                        buffer: buffer,
                        offset: 0,
                        size: SIZEOF_MATRICES,
                    },
                },
            ],
            buffer,
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
const mathConstants = /* wgsl */ `
let PI: f32 = 3.141592653589793;
let PI2: f32 = 6.283185307179586;
let PI_HALF: f32 = 1.5707963267948966;
let RECIPROCAL_PI: f32 = 0.3183098861837907;
let RECIPROCAL_PI2: f32 = 0.15915494309189535;
let EPSILON: f32 = 0.000001;
`;
const mathFunctions = /* wgsl */ `
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
function shader(strings, ...expr) {
    return {
        strings,
        expressions: expr,
    };
}
function shaderBuilder(sourceFragments, pipeline) {
    let str = "";
    sourceFragments.strings.forEach((string, i) => {
        if (typeof sourceFragments.expressions[i] === "string" || typeof sourceFragments.expressions[i] === "number")
            str += string + (sourceFragments.expressions[i] || "");
        else if (sourceFragments.expressions[i]) {
            const fnOrText = sourceFragments.expressions[i];
            if (typeof fnOrText === "string") {
                str += string + fnOrText;
            }
            else {
                const expressionReturn = fnOrText(pipeline);
                if (typeof expressionReturn === "string") {
                    str += string + expressionReturn;
                }
                else if (typeof expressionReturn === "number") {
                    str += string + expressionReturn.toString();
                }
                else {
                    str += string;
                }
            }
        }
        else {
            str += string;
        }
    });
    return str;
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
/*!*************************!*\
  !*** ./src/ts/index.ts ***!
  \*************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _build_untouched_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../build/untouched.wasm */ "./build/untouched.wasm");
/* harmony import */ var _AppBindings__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./AppBindings */ "./src/ts/AppBindings.ts");
/* harmony import */ var _assemblyscript_loader__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @assemblyscript/loader */ "./node_modules/@assemblyscript/loader/index.js");
/* harmony import */ var _core_GameManager__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./core/GameManager */ "./src/ts/core/GameManager.ts");
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};




// Creating WASM with Linear memory
const memory = new WebAssembly.Memory({ initial: 100 });
const importObject = {
    env: {
        memory: memory,
        seed: Date.now,
        abort: (...args) => {
            console.log("abort");
            console.log(importObject.env.getString(args[0]));
        },
        getString: (string_index) => {
            const buffer = importObject.env.memory.buffer;
            const U32 = new Uint32Array(buffer);
            const id_addr = string_index / 4 - 2;
            const id = U32[id_addr];
            if (id !== 0x01)
                throw Error(`not a string index=${string_index} id=${id}`);
            const len = U32[id_addr + 1];
            const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
            return str;
        },
    },
};
const gameManager = new _core_GameManager__WEBPACK_IMPORTED_MODULE_3__.GameManager("canvas");
(0,_AppBindings__WEBPACK_IMPORTED_MODULE_1__.createBindingsGPU)(importObject, gameManager);
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        // Load the wasm file
        const obj = yield _assemblyscript_loader__WEBPACK_IMPORTED_MODULE_2__.default.instantiateStreaming(fetch(_build_untouched_wasm__WEBPACK_IMPORTED_MODULE_0__.default), importObject);
        const message = document.querySelector("#message");
        // Bind the newly created export file
        (0,_AppBindings__WEBPACK_IMPORTED_MODULE_1__.bindExports)(obj);
        try {
            yield gameManager.init(obj.exports);
        }
        catch (err) {
            message.style.display = "initial";
            message.innerHTML = err.message;
        }
        document.querySelector("#apply").addEventListener("click", () => {
            document.querySelector("#input").value;
        });
    });
}
init();

})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=index_bundle.js.map