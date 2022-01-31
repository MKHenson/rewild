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

/***/ "./node_modules/@lit/reactive-element/development/css-tag.js":
/*!*******************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/css-tag.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "supportsAdoptingStyleSheets": () => (/* binding */ supportsAdoptingStyleSheets),
/* harmony export */   "CSSResult": () => (/* binding */ CSSResult),
/* harmony export */   "unsafeCSS": () => (/* binding */ unsafeCSS),
/* harmony export */   "css": () => (/* binding */ css),
/* harmony export */   "adoptStyles": () => (/* binding */ adoptStyles),
/* harmony export */   "getCompatibleStyle": () => (/* binding */ getCompatibleStyle)
/* harmony export */ });
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * Whether the current browser supports `adoptedStyleSheets`.
 */
const supportsAdoptingStyleSheets = window.ShadowRoot &&
    (window.ShadyCSS === undefined || window.ShadyCSS.nativeShadow) &&
    'adoptedStyleSheets' in Document.prototype &&
    'replace' in CSSStyleSheet.prototype;
const constructionToken = Symbol();
const styleSheetCache = new Map();
/**
 * A container for a string of CSS text, that may be used to create a CSSStyleSheet.
 *
 * CSSResult is the return value of `css`-tagged template literals and
 * `unsafeCSS()`. In order to ensure that CSSResults are only created via the
 * `css` tag and `unsafeCSS()`, CSSResult cannot be constructed directly.
 */
class CSSResult {
    constructor(cssText, safeToken) {
        // This property needs to remain unminified.
        this['_$cssResult$'] = true;
        if (safeToken !== constructionToken) {
            throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
        }
        this.cssText = cssText;
    }
    // Note, this is a getter so that it's lazy. In practice, this means
    // stylesheets are not created until the first element instance is made.
    get styleSheet() {
        // Note, if `supportsAdoptingStyleSheets` is true then we assume
        // CSSStyleSheet is constructable.
        let styleSheet = styleSheetCache.get(this.cssText);
        if (supportsAdoptingStyleSheets && styleSheet === undefined) {
            styleSheetCache.set(this.cssText, (styleSheet = new CSSStyleSheet()));
            styleSheet.replaceSync(this.cssText);
        }
        return styleSheet;
    }
    toString() {
        return this.cssText;
    }
}
const textFromCSSResult = (value) => {
    // This property needs to remain unminified.
    if (value['_$cssResult$'] === true) {
        return value.cssText;
    }
    else if (typeof value === 'number') {
        return value;
    }
    else {
        throw new Error(`Value passed to 'css' function must be a 'css' function result: ` +
            `${value}. Use 'unsafeCSS' to pass non-literal values, but take care ` +
            `to ensure page security.`);
    }
};
/**
 * Wrap a value for interpolation in a [[`css`]] tagged template literal.
 *
 * This is unsafe because untrusted CSS text can be used to phone home
 * or exfiltrate data to an attacker controlled site. Take care to only use
 * this with trusted input.
 */
const unsafeCSS = (value) => new CSSResult(typeof value === 'string' ? value : String(value), constructionToken);
/**
 * A template literal tag which can be used with LitElement's
 * [[LitElement.styles | `styles`]] property to set element styles.
 *
 * For security reasons, only literal string values and number may be used in
 * embedded expressions. To incorporate non-literal values [[`unsafeCSS`]] may
 * be used inside an expression.
 */
const css = (strings, ...values) => {
    const cssText = strings.length === 1
        ? strings[0]
        : values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
    return new CSSResult(cssText, constructionToken);
};
/**
 * Applies the given styles to a `shadowRoot`. When Shadow DOM is
 * available but `adoptedStyleSheets` is not, styles are appended to the
 * `shadowRoot` to [mimic spec behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
 * Note, when shimming is used, any styles that are subsequently placed into
 * the shadowRoot should be placed *before* any shimmed adopted styles. This
 * will match spec behavior that gives adopted sheets precedence over styles in
 * shadowRoot.
 */
const adoptStyles = (renderRoot, styles) => {
    if (supportsAdoptingStyleSheets) {
        renderRoot.adoptedStyleSheets = styles.map((s) => s instanceof CSSStyleSheet ? s : s.styleSheet);
    }
    else {
        styles.forEach((s) => {
            const style = document.createElement('style');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nonce = window['litNonce'];
            if (nonce !== undefined) {
                style.setAttribute('nonce', nonce);
            }
            style.textContent = s.cssText;
            renderRoot.appendChild(style);
        });
    }
};
const cssResultFromStyleSheet = (sheet) => {
    let cssText = '';
    for (const rule of sheet.cssRules) {
        cssText += rule.cssText;
    }
    return unsafeCSS(cssText);
};
const getCompatibleStyle = supportsAdoptingStyleSheets
    ? (s) => s
    : (s) => s instanceof CSSStyleSheet ? cssResultFromStyleSheet(s) : s;
//# sourceMappingURL=css-tag.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/base.js":
/*!***************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/base.js ***!
  \***************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "legacyPrototypeMethod": () => (/* binding */ legacyPrototypeMethod),
/* harmony export */   "standardPrototypeMethod": () => (/* binding */ standardPrototypeMethod),
/* harmony export */   "decorateProperty": () => (/* binding */ decorateProperty)
/* harmony export */ });
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const legacyPrototypeMethod = (descriptor, proto, name) => {
    Object.defineProperty(proto, name, descriptor);
};
const standardPrototypeMethod = (descriptor, element) => ({
    kind: 'method',
    placement: 'prototype',
    key: element.key,
    descriptor,
});
/**
 * Helper for decorating a property that is compatible with both TypeScript
 * and Babel decorators. The optional `finisher` can be used to perform work on
 * the class. The optional `descriptor` should return a PropertyDescriptor
 * to install for the given property.
 *
 * @param finisher {function} Optional finisher method; receives the element
 * constructor and property key as arguments and has no return value.
 * @param descriptor {function} Optional descriptor method; receives the
 * property key as an argument and returns a property descriptor to define for
 * the given property.
 * @returns {ClassElement|void}
 */
const decorateProperty = ({ finisher, descriptor, }) => (protoOrDescriptor, name
// Note TypeScript requires the return type to be `void|any`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => {
    var _a;
    // TypeScript / Babel legacy mode
    if (name !== undefined) {
        const ctor = protoOrDescriptor
            .constructor;
        if (descriptor !== undefined) {
            Object.defineProperty(protoOrDescriptor, name, descriptor(name));
        }
        finisher === null || finisher === void 0 ? void 0 : finisher(ctor, name);
        // Babel standard mode
    }
    else {
        // Note, the @property decorator saves `key` as `originalKey`
        // so try to use it here.
        const key = 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_a = protoOrDescriptor.originalKey) !== null && _a !== void 0 ? _a : protoOrDescriptor.key;
        const info = descriptor != undefined
            ? {
                kind: 'method',
                placement: 'prototype',
                key,
                descriptor: descriptor(protoOrDescriptor.key),
            }
            : { ...protoOrDescriptor, key };
        if (finisher != undefined) {
            info.finisher = function (ctor) {
                finisher(ctor, key);
            };
        }
        return info;
    }
};
//# sourceMappingURL=base.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/custom-element.js":
/*!*************************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/custom-element.js ***!
  \*************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "customElement": () => (/* binding */ customElement)
/* harmony export */ });
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const legacyCustomElement = (tagName, clazz) => {
    window.customElements.define(tagName, clazz);
    // Cast as any because TS doesn't recognize the return type as being a
    // subtype of the decorated class when clazz is typed as
    // `Constructor<HTMLElement>` for some reason.
    // `Constructor<HTMLElement>` is helpful to make sure the decorator is
    // applied to elements however.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return clazz;
};
const standardCustomElement = (tagName, descriptor) => {
    const { kind, elements } = descriptor;
    return {
        kind,
        elements,
        // This callback is called once the class is otherwise fully defined
        finisher(clazz) {
            window.customElements.define(tagName, clazz);
        },
    };
};
/**
 * Class decorator factory that defines the decorated class as a custom element.
 *
 * ```js
 * @customElement('my-element')
 * class MyElement extends LitElement {
 *   render() {
 *     return html``;
 *   }
 * }
 * ```
 * @category Decorator
 * @param tagName The tag name of the custom element to define.
 */
const customElement = (tagName) => (classOrDescriptor) => typeof classOrDescriptor === 'function'
    ? legacyCustomElement(tagName, classOrDescriptor)
    : standardCustomElement(tagName, classOrDescriptor);
//# sourceMappingURL=custom-element.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/event-options.js":
/*!************************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/event-options.js ***!
  \************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "eventOptions": () => (/* binding */ eventOptions)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Adds event listener options to a method used as an event listener in a
 * lit-html template.
 *
 * @param options An object that specifies event listener options as accepted by
 * `EventTarget#addEventListener` and `EventTarget#removeEventListener`.
 *
 * Current browsers support the `capture`, `passive`, and `once` options. See:
 * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Parameters
 *
 * ```ts
 * class MyElement {
 *   clicked = false;
 *
 *   render() {
 *     return html`
 *       <div @click=${this._onClick}`>
 *         <button></button>
 *       </div>
 *     `;
 *   }
 *
 *   @eventOptions({capture: true})
 *   _onClick(e) {
 *     this.clicked = true;
 *   }
 * }
 * ```
 * @category Decorator
 */
function eventOptions(options) {
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        finisher: (ctor, name) => {
            Object.assign(ctor.prototype[name], options);
        },
    });
}
//# sourceMappingURL=event-options.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/property.js":
/*!*******************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/property.js ***!
  \*******************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "property": () => (/* binding */ property)
/* harmony export */ });
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const standardProperty = (options, element) => {
    // When decorating an accessor, pass it through and add property metadata.
    // Note, the `hasOwnProperty` check in `createProperty` ensures we don't
    // stomp over the user's accessor.
    if (element.kind === 'method' &&
        element.descriptor &&
        !('value' in element.descriptor)) {
        return {
            ...element,
            finisher(clazz) {
                clazz.createProperty(element.key, options);
            },
        };
    }
    else {
        // createProperty() takes care of defining the property, but we still
        // must return some kind of descriptor, so return a descriptor for an
        // unused prototype field. The finisher calls createProperty().
        return {
            kind: 'field',
            key: Symbol(),
            placement: 'own',
            descriptor: {},
            // store the original key so subsequent decorators have access to it.
            originalKey: element.key,
            // When @babel/plugin-proposal-decorators implements initializers,
            // do this instead of the initializer below. See:
            // https://github.com/babel/babel/issues/9260 extras: [
            //   {
            //     kind: 'initializer',
            //     placement: 'own',
            //     initializer: descriptor.initializer,
            //   }
            // ],
            initializer() {
                if (typeof element.initializer === 'function') {
                    this[element.key] = element.initializer.call(this);
                }
            },
            finisher(clazz) {
                clazz.createProperty(element.key, options);
            },
        };
    }
};
const legacyProperty = (options, proto, name) => {
    proto.constructor.createProperty(name, options);
};
/**
 * A property decorator which creates a reactive property that reflects a
 * corresponding attribute value. When a decorated property is set
 * the element will update and render. A [[`PropertyDeclaration`]] may
 * optionally be supplied to configure property features.
 *
 * This decorator should only be used for public fields. As public fields,
 * properties should be considered as primarily settable by element users,
 * either via attribute or the property itself.
 *
 * Generally, properties that are changed by the element should be private or
 * protected fields and should use the [[`state`]] decorator.
 *
 * However, sometimes element code does need to set a public property. This
 * should typically only be done in response to user interaction, and an event
 * should be fired informing the user; for example, a checkbox sets its
 * `checked` property when clicked and fires a `changed` event. Mutating public
 * properties should typically not be done for non-primitive (object or array)
 * properties. In other cases when an element needs to manage state, a private
 * property decorated via the [[`state`]] decorator should be used. When needed,
 * state properties can be initialized via public properties to facilitate
 * complex interactions.
 *
 * ```ts
 * class MyElement {
 *   @property({ type: Boolean })
 *   clicked = false;
 * }
 * ```
 * @category Decorator
 * @ExportDecoratedItems
 */
function property(options) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (protoOrDescriptor, name) => name !== undefined
        ? legacyProperty(options, protoOrDescriptor, name)
        : standardProperty(options, protoOrDescriptor);
}
//# sourceMappingURL=property.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/query-all.js":
/*!********************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/query-all.js ***!
  \********************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "queryAll": () => (/* binding */ queryAll)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * A property decorator that converts a class property into a getter
 * that executes a querySelectorAll on the element's renderRoot.
 *
 * @param selector A DOMString containing one or more selectors to match.
 *
 * See:
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
 *
 * ```ts
 * class MyElement {
 *   @queryAll('div')
 *   divs;
 *
 *   render() {
 *     return html`
 *       <div id="first"></div>
 *       <div id="second"></div>
 *     `;
 *   }
 * }
 * ```
 * @category Decorator
 */
function queryAll(selector) {
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        descriptor: (_name) => ({
            get() {
                var _a, _b;
                return (_b = (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelectorAll(selector)) !== null && _b !== void 0 ? _b : [];
            },
            enumerable: true,
            configurable: true,
        }),
    });
}
//# sourceMappingURL=query-all.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/query-assigned-elements.js":
/*!**********************************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/query-assigned-elements.js ***!
  \**********************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "queryAssignedElements": () => (/* binding */ queryAssignedElements)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a;
/*
 * IMPORTANT: For compatibility with tsickle and the Closure JS compiler, all
 * property decorators (but not class decorators) in this file that have
 * an @ExportDecoratedItems annotation must be defined as a regular function,
 * not an arrow function.
 */

/**
 * A tiny module scoped polyfill for HTMLSlotElement.assignedElements.
 */
const slotAssignedElements = ((_a = window.HTMLSlotElement) === null || _a === void 0 ? void 0 : _a.prototype.assignedElements) != null
    ? (slot, opts) => slot.assignedElements(opts)
    : (slot, opts) => slot
        .assignedNodes(opts)
        .filter((node) => node.nodeType === Node.ELEMENT_NODE);
/**
 * A property decorator that converts a class property into a getter that
 * returns the `assignedElements` of the given `slot`. Provides a declarative
 * way to use
 * [`slot.assignedElements`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement/assignedElements).
 *
 * Can be passed an optional [[`QueryAssignedElementsOptions`]] object.
 *
 * Example usage:
 * ```ts
 * class MyElement {
 *   @queryAssignedElements({ slot: 'list' })
 *   listItems!: Array<HTMLElement>;
 *   @queryAssignedElements()
 *   unnamedSlotEls!: Array<HTMLElement>;
 *
 *   render() {
 *     return html`
 *       <slot name="list"></slot>
 *       <slot></slot>
 *     `;
 *   }
 * }
 * ```
 *
 * Note, the type of this property should be annotated as `Array<HTMLElement>`.
 *
 * @category Decorator
 */
function queryAssignedElements(options) {
    const { slot, selector } = options !== null && options !== void 0 ? options : {};
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        descriptor: (_name) => ({
            get() {
                var _a;
                const slotSelector = `slot${slot ? `[name=${slot}]` : ':not([name])'}`;
                const slotEl = (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelector(slotSelector);
                const elements = slotEl != null ? slotAssignedElements(slotEl, options) : [];
                if (selector) {
                    return elements.filter((node) => node.matches(selector));
                }
                return elements;
            },
            enumerable: true,
            configurable: true,
        }),
    });
}
//# sourceMappingURL=query-assigned-elements.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/query-assigned-nodes.js":
/*!*******************************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/query-assigned-nodes.js ***!
  \*******************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "queryAssignedNodes": () => (/* binding */ queryAssignedNodes)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/* harmony import */ var _query_assigned_elements_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./query-assigned-elements.js */ "./node_modules/@lit/reactive-element/development/decorators/query-assigned-elements.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/*
 * IMPORTANT: For compatibility with tsickle and the Closure JS compiler, all
 * property decorators (but not class decorators) in this file that have
 * an @ExportDecoratedItems annotation must be defined as a regular function,
 * not an arrow function.
 */


function queryAssignedNodes(slotOrOptions, flatten, selector) {
    // Normalize the overloaded arguments.
    let slot = slotOrOptions;
    let assignedNodesOptions;
    if (typeof slotOrOptions === 'object') {
        slot = slotOrOptions.slot;
        assignedNodesOptions = slotOrOptions;
    }
    else {
        assignedNodesOptions = { flatten };
    }
    // For backwards compatibility, queryAssignedNodes with a selector behaves
    // exactly like queryAssignedElements with a selector.
    if (selector) {
        return (0,_query_assigned_elements_js__WEBPACK_IMPORTED_MODULE_1__.queryAssignedElements)({
            slot: slot,
            flatten,
            selector,
        });
    }
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        descriptor: (_name) => ({
            get() {
                var _a, _b;
                const slotSelector = `slot${slot ? `[name=${slot}]` : ':not([name])'}`;
                const slotEl = (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelector(slotSelector);
                return (_b = slotEl === null || slotEl === void 0 ? void 0 : slotEl.assignedNodes(assignedNodesOptions)) !== null && _b !== void 0 ? _b : [];
            },
            enumerable: true,
            configurable: true,
        }),
    });
}
//# sourceMappingURL=query-assigned-nodes.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/query-async.js":
/*!**********************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/query-async.js ***!
  \**********************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "queryAsync": () => (/* binding */ queryAsync)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Note, in the future, we may extend this decorator to support the use case
// where the queried element may need to do work to become ready to interact
// with (e.g. load some implementation code). If so, we might elect to
// add a second argument defining a function that can be run to make the
// queried element loaded/updated/ready.
/**
 * A property decorator that converts a class property into a getter that
 * returns a promise that resolves to the result of a querySelector on the
 * element's renderRoot done after the element's `updateComplete` promise
 * resolves. When the queried property may change with element state, this
 * decorator can be used instead of requiring users to await the
 * `updateComplete` before accessing the property.
 *
 * @param selector A DOMString containing one or more selectors to match.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector
 *
 * ```ts
 * class MyElement {
 *   @queryAsync('#first')
 *   first;
 *
 *   render() {
 *     return html`
 *       <div id="first"></div>
 *       <div id="second"></div>
 *     `;
 *   }
 * }
 *
 * // external usage
 * async doSomethingWithFirst() {
 *  (await aMyElement.first).doSomething();
 * }
 * ```
 * @category Decorator
 */
function queryAsync(selector) {
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        descriptor: (_name) => ({
            async get() {
                var _a;
                await this.updateComplete;
                return (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelector(selector);
            },
            enumerable: true,
            configurable: true,
        }),
    });
}
//# sourceMappingURL=query-async.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/query.js":
/*!****************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/query.js ***!
  \****************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "query": () => (/* binding */ query)
/* harmony export */ });
/* harmony import */ var _base_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base.js */ "./node_modules/@lit/reactive-element/development/decorators/base.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * A property decorator that converts a class property into a getter that
 * executes a querySelector on the element's renderRoot.
 *
 * @param selector A DOMString containing one or more selectors to match.
 * @param cache An optional boolean which when true performs the DOM query only
 *     once and caches the result.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector
 *
 * ```ts
 * class MyElement {
 *   @query('#first')
 *   first;
 *
 *   render() {
 *     return html`
 *       <div id="first"></div>
 *       <div id="second"></div>
 *     `;
 *   }
 * }
 * ```
 * @category Decorator
 */
function query(selector, cache) {
    return (0,_base_js__WEBPACK_IMPORTED_MODULE_0__.decorateProperty)({
        descriptor: (name) => {
            const descriptor = {
                get() {
                    var _a, _b;
                    return (_b = (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelector(selector)) !== null && _b !== void 0 ? _b : null;
                },
                enumerable: true,
                configurable: true,
            };
            if (cache) {
                const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
                descriptor.get = function () {
                    var _a, _b;
                    if (this[key] === undefined) {
                        this[key] = (_b = (_a = this.renderRoot) === null || _a === void 0 ? void 0 : _a.querySelector(selector)) !== null && _b !== void 0 ? _b : null;
                    }
                    return this[key];
                };
            }
            return descriptor;
        },
    });
}
//# sourceMappingURL=query.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/decorators/state.js":
/*!****************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/decorators/state.js ***!
  \****************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "state": () => (/* binding */ state)
/* harmony export */ });
/* harmony import */ var _property_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./property.js */ "./node_modules/@lit/reactive-element/development/decorators/property.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/*
 * IMPORTANT: For compatibility with tsickle and the Closure JS compiler, all
 * property decorators (but not class decorators) in this file that have
 * an @ExportDecoratedItems annotation must be defined as a regular function,
 * not an arrow function.
 */

/**
 * Declares a private or protected reactive property that still triggers
 * updates to the element when it changes. It does not reflect from the
 * corresponding attribute.
 *
 * Properties declared this way must not be used from HTML or HTML templating
 * systems, they're solely for properties internal to the element. These
 * properties may be renamed by optimization tools like closure compiler.
 * @category Decorator
 */
function state(options) {
    return (0,_property_js__WEBPACK_IMPORTED_MODULE_0__.property)({
        ...options,
        state: true,
    });
}
//# sourceMappingURL=state.js.map

/***/ }),

/***/ "./node_modules/@lit/reactive-element/development/reactive-element.js":
/*!****************************************************************************!*\
  !*** ./node_modules/@lit/reactive-element/development/reactive-element.js ***!
  \****************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "CSSResult": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.CSSResult),
/* harmony export */   "adoptStyles": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.adoptStyles),
/* harmony export */   "css": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.css),
/* harmony export */   "getCompatibleStyle": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.getCompatibleStyle),
/* harmony export */   "supportsAdoptingStyleSheets": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.supportsAdoptingStyleSheets),
/* harmony export */   "unsafeCSS": () => (/* reexport safe */ _css_tag_js__WEBPACK_IMPORTED_MODULE_0__.unsafeCSS),
/* harmony export */   "defaultConverter": () => (/* binding */ defaultConverter),
/* harmony export */   "notEqual": () => (/* binding */ notEqual),
/* harmony export */   "ReactiveElement": () => (/* binding */ ReactiveElement)
/* harmony export */ });
/* harmony import */ var _css_tag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./css-tag.js */ "./node_modules/@lit/reactive-element/development/css-tag.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a, _b, _c;
var _d;
/**
 * Use this module if you want to create your own base class extending
 * [[ReactiveElement]].
 * @packageDocumentation
 */


const DEV_MODE = true;
let requestUpdateThenable;
let issueWarning;
const trustedTypes = window
    .trustedTypes;
// Temporary workaround for https://crbug.com/993268
// Currently, any attribute starting with "on" is considered to be a
// TrustedScript source. Such boolean attributes must be set to the equivalent
// trusted emptyScript value.
const emptyStringForBooleanAttribute = trustedTypes
    ? trustedTypes.emptyScript
    : '';
const polyfillSupport = DEV_MODE
    ? window.reactiveElementPolyfillSupportDevMode
    : window.reactiveElementPolyfillSupport;
if (DEV_MODE) {
    // Ensure warnings are issued only 1x, even if multiple versions of Lit
    // are loaded.
    const issuedWarnings = ((_a = globalThis.litIssuedWarnings) !== null && _a !== void 0 ? _a : (globalThis.litIssuedWarnings = new Set()));
    // Issue a warning, if we haven't already.
    issueWarning = (code, warning) => {
        warning += ` See https://lit.dev/msg/${code} for more information.`;
        if (!issuedWarnings.has(warning)) {
            console.warn(warning);
            issuedWarnings.add(warning);
        }
    };
    issueWarning('dev-mode', `Lit is in dev mode. Not recommended for production!`);
    // Issue polyfill support warning.
    if (((_b = window.ShadyDOM) === null || _b === void 0 ? void 0 : _b.inUse) && polyfillSupport === undefined) {
        issueWarning('polyfill-support-missing', `Shadow DOM is being polyfilled via \`ShadyDOM\` but ` +
            `the \`polyfill-support\` module has not been loaded.`);
    }
    requestUpdateThenable = (name) => ({
        then: (onfulfilled, _onrejected) => {
            issueWarning('request-update-promise', `The \`requestUpdate\` method should no longer return a Promise but ` +
                `does so on \`${name}\`. Use \`updateComplete\` instead.`);
            if (onfulfilled !== undefined) {
                onfulfilled(false);
            }
        },
    });
}
/*
 * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
 * replaced at compile time by the munged name for object[property]. We cannot
 * alias this function, so we have to use a small shim that has the same
 * behavior when not compiling.
 */
/*@__INLINE__*/
const JSCompiler_renameProperty = (prop, _obj) => prop;
const defaultConverter = {
    toAttribute(value, type) {
        switch (type) {
            case Boolean:
                value = value ? emptyStringForBooleanAttribute : null;
                break;
            case Object:
            case Array:
                // if the value is `null` or `undefined` pass this through
                // to allow removing/no change behavior.
                value = value == null ? value : JSON.stringify(value);
                break;
        }
        return value;
    },
    fromAttribute(value, type) {
        let fromValue = value;
        switch (type) {
            case Boolean:
                fromValue = value !== null;
                break;
            case Number:
                fromValue = value === null ? null : Number(value);
                break;
            case Object:
            case Array:
                // Do *not* generate exception when invalid JSON is set as elements
                // don't normally complain on being mis-configured.
                // TODO(sorvell): Do generate exception in *dev mode*.
                try {
                    // Assert to adhere to Bazel's "must type assert JSON parse" rule.
                    fromValue = JSON.parse(value);
                }
                catch (e) {
                    fromValue = null;
                }
                break;
        }
        return fromValue;
    },
};
/**
 * Change function that returns true if `value` is different from `oldValue`.
 * This method is used as the default for a property's `hasChanged` function.
 */
const notEqual = (value, old) => {
    // This ensures (old==NaN, value==NaN) always returns false
    return old !== value && (old === old || value === value);
};
const defaultPropertyDeclaration = {
    attribute: true,
    type: String,
    converter: defaultConverter,
    reflect: false,
    hasChanged: notEqual,
};
/**
 * The Closure JS Compiler doesn't currently have good support for static
 * property semantics where "this" is dynamic (e.g.
 * https://github.com/google/closure-compiler/issues/3177 and others) so we use
 * this hack to bypass any rewriting by the compiler.
 */
const finalized = 'finalized';
/**
 * Base element class which manages element properties and attributes. When
 * properties change, the `update` method is asynchronously called. This method
 * should be supplied by subclassers to render updates as desired.
 * @noInheritDoc
 */
class ReactiveElement extends HTMLElement {
    constructor() {
        super();
        this.__instanceProperties = new Map();
        /**
         * True if there is a pending update as a result of calling `requestUpdate()`.
         * Should only be read.
         * @category updates
         */
        this.isUpdatePending = false;
        /**
         * Is set to `true` after the first update. The element code cannot assume
         * that `renderRoot` exists before the element `hasUpdated`.
         * @category updates
         */
        this.hasUpdated = false;
        /**
         * Name of currently reflecting property
         */
        this.__reflectingProperty = null;
        this._initialize();
    }
    /**
     * Adds an initializer function to the class that is called during instance
     * construction.
     *
     * This is useful for code that runs against a `ReactiveElement`
     * subclass, such as a decorator, that needs to do work for each
     * instance, such as setting up a `ReactiveController`.
     *
     * ```ts
     * const myDecorator = (target: typeof ReactiveElement, key: string) => {
     *   target.addInitializer((instance: ReactiveElement) => {
     *     // This is run during construction of the element
     *     new MyController(instance);
     *   });
     * }
     * ```
     *
     * Decorating a field will then cause each instance to run an initializer
     * that adds a controller:
     *
     * ```ts
     * class MyElement extends LitElement {
     *   @myDecorator foo;
     * }
     * ```
     *
     * Initializers are stored per-constructor. Adding an initializer to a
     * subclass does not add it to a superclass. Since initializers are run in
     * constructors, initializers will run in order of the class hierarchy,
     * starting with superclasses and progressing to the instance's class.
     *
     * @nocollapse
     */
    static addInitializer(initializer) {
        var _a;
        (_a = this._initializers) !== null && _a !== void 0 ? _a : (this._initializers = []);
        this._initializers.push(initializer);
    }
    /**
     * Returns a list of attributes corresponding to the registered properties.
     * @nocollapse
     * @category attributes
     */
    static get observedAttributes() {
        // note: piggy backing on this to ensure we're finalized.
        this.finalize();
        const attributes = [];
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this.elementProperties.forEach((v, p) => {
            const attr = this.__attributeNameForProperty(p, v);
            if (attr !== undefined) {
                this.__attributeToPropertyMap.set(attr, p);
                attributes.push(attr);
            }
        });
        return attributes;
    }
    /**
     * Creates a property accessor on the element prototype if one does not exist
     * and stores a `PropertyDeclaration` for the property with the given options.
     * The property setter calls the property's `hasChanged` property option
     * or uses a strict identity check to determine whether or not to request
     * an update.
     *
     * This method may be overridden to customize properties; however,
     * when doing so, it's important to call `super.createProperty` to ensure
     * the property is setup correctly. This method calls
     * `getPropertyDescriptor` internally to get a descriptor to install.
     * To customize what properties do when they are get or set, override
     * `getPropertyDescriptor`. To customize the options for a property,
     * implement `createProperty` like this:
     *
     * ```ts
     * static createProperty(name, options) {
     *   options = Object.assign(options, {myOption: true});
     *   super.createProperty(name, options);
     * }
     * ```
     *
     * @nocollapse
     * @category properties
     */
    static createProperty(name, options = defaultPropertyDeclaration) {
        var _a;
        // if this is a state property, force the attribute to false.
        if (options.state) {
            // Cast as any since this is readonly.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options.attribute = false;
        }
        // Note, since this can be called by the `@property` decorator which
        // is called before `finalize`, we ensure finalization has been kicked off.
        this.finalize();
        this.elementProperties.set(name, options);
        // Do not generate an accessor if the prototype already has one, since
        // it would be lost otherwise and that would never be the user's intention;
        // Instead, we expect users to call `requestUpdate` themselves from
        // user-defined accessors. Note that if the super has an accessor we will
        // still overwrite it
        if (!options.noAccessor && !this.prototype.hasOwnProperty(name)) {
            const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
            const descriptor = this.getPropertyDescriptor(name, key, options);
            if (descriptor !== undefined) {
                Object.defineProperty(this.prototype, name, descriptor);
                if (DEV_MODE) {
                    // If this class doesn't have its own set, create one and initialize
                    // with the values in the set from the nearest ancestor class, if any.
                    if (!this.hasOwnProperty('__reactivePropertyKeys')) {
                        this.__reactivePropertyKeys = new Set((_a = this.__reactivePropertyKeys) !== null && _a !== void 0 ? _a : []);
                    }
                    this.__reactivePropertyKeys.add(name);
                }
            }
        }
    }
    /**
     * Returns a property descriptor to be defined on the given named property.
     * If no descriptor is returned, the property will not become an accessor.
     * For example,
     *
     * ```ts
     * class MyElement extends LitElement {
     *   static getPropertyDescriptor(name, key, options) {
     *     const defaultDescriptor =
     *         super.getPropertyDescriptor(name, key, options);
     *     const setter = defaultDescriptor.set;
     *     return {
     *       get: defaultDescriptor.get,
     *       set(value) {
     *         setter.call(this, value);
     *         // custom action.
     *       },
     *       configurable: true,
     *       enumerable: true
     *     }
     *   }
     * }
     * ```
     *
     * @nocollapse
     * @category properties
     */
    static getPropertyDescriptor(name, key, options) {
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get() {
                return this[key];
            },
            set(value) {
                const oldValue = this[name];
                this[key] = value;
                this.requestUpdate(name, oldValue, options);
            },
            configurable: true,
            enumerable: true,
        };
    }
    /**
     * Returns the property options associated with the given property.
     * These options are defined with a `PropertyDeclaration` via the `properties`
     * object or the `@property` decorator and are registered in
     * `createProperty(...)`.
     *
     * Note, this method should be considered "final" and not overridden. To
     * customize the options for a given property, override [[`createProperty`]].
     *
     * @nocollapse
     * @final
     * @category properties
     */
    static getPropertyOptions(name) {
        return this.elementProperties.get(name) || defaultPropertyDeclaration;
    }
    /**
     * Creates property accessors for registered properties, sets up element
     * styling, and ensures any superclasses are also finalized. Returns true if
     * the element was finalized.
     * @nocollapse
     */
    static finalize() {
        if (this.hasOwnProperty(finalized)) {
            return false;
        }
        this[finalized] = true;
        // finalize any superclasses
        const superCtor = Object.getPrototypeOf(this);
        superCtor.finalize();
        this.elementProperties = new Map(superCtor.elementProperties);
        // initialize Map populated in observedAttributes
        this.__attributeToPropertyMap = new Map();
        // make any properties
        // Note, only process "own" properties since this element will inherit
        // any properties defined on the superClass, and finalization ensures
        // the entire prototype chain is finalized.
        if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
            const props = this.properties;
            // support symbols in properties (IE11 does not support this)
            const propKeys = [
                ...Object.getOwnPropertyNames(props),
                ...Object.getOwnPropertySymbols(props),
            ];
            // This for/of is ok because propKeys is an array
            for (const p of propKeys) {
                // note, use of `any` is due to TypeScript lack of support for symbol in
                // index types
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.createProperty(p, props[p]);
            }
        }
        this.elementStyles = this.finalizeStyles(this.styles);
        // DEV mode warnings
        if (DEV_MODE) {
            const warnRemovedOrRenamed = (name, renamed = false) => {
                if (this.prototype.hasOwnProperty(name)) {
                    issueWarning(renamed ? 'renamed-api' : 'removed-api', `\`${name}\` is implemented on class ${this.name}. It ` +
                        `has been ${renamed ? 'renamed' : 'removed'} ` +
                        `in this version of LitElement.`);
                }
            };
            warnRemovedOrRenamed('initialize');
            warnRemovedOrRenamed('requestUpdateInternal');
            warnRemovedOrRenamed('_getUpdateComplete', true);
        }
        return true;
    }
    /**
     * Takes the styles the user supplied via the `static styles` property and
     * returns the array of styles to apply to the element.
     * Override this method to integrate into a style management system.
     *
     * Styles are deduplicated preserving the _last_ instance in the list. This
     * is a performance optimization to avoid duplicated styles that can occur
     * especially when composing via subclassing. The last item is kept to try
     * to preserve the cascade order with the assumption that it's most important
     * that last added styles override previous styles.
     *
     * @nocollapse
     * @category styles
     */
    static finalizeStyles(styles) {
        const elementStyles = [];
        if (Array.isArray(styles)) {
            // Dedupe the flattened array in reverse order to preserve the last items.
            // Casting to Array<unknown> works around TS error that
            // appears to come from trying to flatten a type CSSResultArray.
            const set = new Set(styles.flat(Infinity).reverse());
            // Then preserve original order by adding the set items in reverse order.
            for (const s of set) {
                elementStyles.unshift((0,_css_tag_js__WEBPACK_IMPORTED_MODULE_0__.getCompatibleStyle)(s));
            }
        }
        else if (styles !== undefined) {
            elementStyles.push((0,_css_tag_js__WEBPACK_IMPORTED_MODULE_0__.getCompatibleStyle)(styles));
        }
        return elementStyles;
    }
    /**
     * Returns the property name for the given attribute `name`.
     * @nocollapse
     */
    static __attributeNameForProperty(name, options) {
        const attribute = options.attribute;
        return attribute === false
            ? undefined
            : typeof attribute === 'string'
                ? attribute
                : typeof name === 'string'
                    ? name.toLowerCase()
                    : undefined;
    }
    /**
     * Internal only override point for customizing work done when elements
     * are constructed.
     *
     * @internal
     */
    _initialize() {
        var _a;
        this.__updatePromise = new Promise((res) => (this.enableUpdating = res));
        this._$changedProperties = new Map();
        this.__saveInstanceProperties();
        // ensures first update will be caught by an early access of
        // `updateComplete`
        this.requestUpdate();
        (_a = this.constructor._initializers) === null || _a === void 0 ? void 0 : _a.forEach((i) => i(this));
    }
    /**
     * Registers a `ReactiveController` to participate in the element's reactive
     * update cycle. The element automatically calls into any registered
     * controllers during its lifecycle callbacks.
     *
     * If the element is connected when `addController()` is called, the
     * controller's `hostConnected()` callback will be immediately called.
     * @category controllers
     */
    addController(controller) {
        var _a, _b;
        ((_a = this.__controllers) !== null && _a !== void 0 ? _a : (this.__controllers = [])).push(controller);
        // If a controller is added after the element has been connected,
        // call hostConnected. Note, re-using existence of `renderRoot` here
        // (which is set in connectedCallback) to avoid the need to track a
        // first connected state.
        if (this.renderRoot !== undefined && this.isConnected) {
            (_b = controller.hostConnected) === null || _b === void 0 ? void 0 : _b.call(controller);
        }
    }
    /**
     * Removes a `ReactiveController` from the element.
     * @category controllers
     */
    removeController(controller) {
        var _a;
        // Note, if the indexOf is -1, the >>> will flip the sign which makes the
        // splice do nothing.
        (_a = this.__controllers) === null || _a === void 0 ? void 0 : _a.splice(this.__controllers.indexOf(controller) >>> 0, 1);
    }
    /**
     * Fixes any properties set on the instance before upgrade time.
     * Otherwise these would shadow the accessor and break these properties.
     * The properties are stored in a Map which is played back after the
     * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
     * (<=41), properties created for native platform properties like (`id` or
     * `name`) may not have default values set in the element constructor. On
     * these browsers native properties appear on instances and therefore their
     * default value will overwrite any element default (e.g. if the element sets
     * this.id = 'id' in the constructor, the 'id' will become '' since this is
     * the native platform default).
     */
    __saveInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this.constructor.elementProperties.forEach((_v, p) => {
            if (this.hasOwnProperty(p)) {
                this.__instanceProperties.set(p, this[p]);
                delete this[p];
            }
        });
    }
    /**
     * Returns the node into which the element should render and by default
     * creates and returns an open shadowRoot. Implement to customize where the
     * element's DOM is rendered. For example, to render into the element's
     * childNodes, return `this`.
     *
     * @return Returns a node into which to render.
     * @category rendering
     */
    createRenderRoot() {
        var _a;
        const renderRoot = (_a = this.shadowRoot) !== null && _a !== void 0 ? _a : this.attachShadow(this.constructor.shadowRootOptions);
        (0,_css_tag_js__WEBPACK_IMPORTED_MODULE_0__.adoptStyles)(renderRoot, this.constructor.elementStyles);
        return renderRoot;
    }
    /**
     * On first connection, creates the element's renderRoot, sets up
     * element styling, and enables updating.
     * @category lifecycle
     */
    connectedCallback() {
        var _a;
        // create renderRoot before first update.
        if (this.renderRoot === undefined) {
            this.renderRoot = this.createRenderRoot();
        }
        this.enableUpdating(true);
        (_a = this.__controllers) === null || _a === void 0 ? void 0 : _a.forEach((c) => { var _a; return (_a = c.hostConnected) === null || _a === void 0 ? void 0 : _a.call(c); });
    }
    /**
     * Note, this method should be considered final and not overridden. It is
     * overridden on the element instance with a function that triggers the first
     * update.
     * @category updates
     */
    enableUpdating(_requestedUpdate) { }
    /**
     * Allows for `super.disconnectedCallback()` in extensions while
     * reserving the possibility of making non-breaking feature additions
     * when disconnecting at some point in the future.
     * @category lifecycle
     */
    disconnectedCallback() {
        var _a;
        (_a = this.__controllers) === null || _a === void 0 ? void 0 : _a.forEach((c) => { var _a; return (_a = c.hostDisconnected) === null || _a === void 0 ? void 0 : _a.call(c); });
    }
    /**
     * Synchronizes property values when attributes change.
     * @category attributes
     */
    attributeChangedCallback(name, _old, value) {
        this._$attributeToProperty(name, value);
    }
    __propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
        var _a, _b;
        const attr = this.constructor.__attributeNameForProperty(name, options);
        if (attr !== undefined && options.reflect === true) {
            const toAttribute = (_b = (_a = options.converter) === null || _a === void 0 ? void 0 : _a.toAttribute) !== null && _b !== void 0 ? _b : defaultConverter.toAttribute;
            const attrValue = toAttribute(value, options.type);
            if (DEV_MODE &&
                this.constructor.enabledWarnings.indexOf('migration') >= 0 &&
                attrValue === undefined) {
                issueWarning('undefined-attribute-value', `The attribute value for the ${name} property is ` +
                    `undefined on element ${this.localName}. The attribute will be ` +
                    `removed, but in the previous version of \`ReactiveElement\`, ` +
                    `the attribute would not have changed.`);
            }
            // Track if the property is being reflected to avoid
            // setting the property again via `attributeChangedCallback`. Note:
            // 1. this takes advantage of the fact that the callback is synchronous.
            // 2. will behave incorrectly if multiple attributes are in the reaction
            // stack at time of calling. However, since we process attributes
            // in `update` this should not be possible (or an extreme corner case
            // that we'd like to discover).
            // mark state reflecting
            this.__reflectingProperty = name;
            if (attrValue == null) {
                this.removeAttribute(attr);
            }
            else {
                this.setAttribute(attr, attrValue);
            }
            // mark state not reflecting
            this.__reflectingProperty = null;
        }
    }
    /** @internal */
    _$attributeToProperty(name, value) {
        var _a, _b, _c;
        const ctor = this.constructor;
        // Note, hint this as an `AttributeMap` so closure clearly understands
        // the type; it has issues with tracking types through statics
        const propName = ctor.__attributeToPropertyMap.get(name);
        // Use tracking info to avoid reflecting a property value to an attribute
        // if it was just set because the attribute changed.
        if (propName !== undefined && this.__reflectingProperty !== propName) {
            const options = ctor.getPropertyOptions(propName);
            const converter = options.converter;
            const fromAttribute = (_c = (_b = (_a = converter) === null || _a === void 0 ? void 0 : _a.fromAttribute) !== null && _b !== void 0 ? _b : (typeof converter === 'function'
                ? converter
                : null)) !== null && _c !== void 0 ? _c : defaultConverter.fromAttribute;
            // mark state reflecting
            this.__reflectingProperty = propName;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this[propName] = fromAttribute(value, options.type);
            // mark state not reflecting
            this.__reflectingProperty = null;
        }
    }
    /**
     * Requests an update which is processed asynchronously. This should be called
     * when an element should update based on some state not triggered by setting
     * a reactive property. In this case, pass no arguments. It should also be
     * called when manually implementing a property setter. In this case, pass the
     * property `name` and `oldValue` to ensure that any configured property
     * options are honored.
     *
     * @param name name of requesting property
     * @param oldValue old value of requesting property
     * @param options property options to use instead of the previously
     *     configured options
     * @category updates
     */
    requestUpdate(name, oldValue, options) {
        let shouldRequestUpdate = true;
        // If we have a property key, perform property update steps.
        if (name !== undefined) {
            options =
                options ||
                    this.constructor.getPropertyOptions(name);
            const hasChanged = options.hasChanged || notEqual;
            if (hasChanged(this[name], oldValue)) {
                if (!this._$changedProperties.has(name)) {
                    this._$changedProperties.set(name, oldValue);
                }
                // Add to reflecting properties set.
                // Note, it's important that every change has a chance to add the
                // property to `_reflectingProperties`. This ensures setting
                // attribute + property reflects correctly.
                if (options.reflect === true && this.__reflectingProperty !== name) {
                    if (this.__reflectingProperties === undefined) {
                        this.__reflectingProperties = new Map();
                    }
                    this.__reflectingProperties.set(name, options);
                }
            }
            else {
                // Abort the request if the property should not be considered changed.
                shouldRequestUpdate = false;
            }
        }
        if (!this.isUpdatePending && shouldRequestUpdate) {
            this.__updatePromise = this.__enqueueUpdate();
        }
        // Note, since this no longer returns a promise, in dev mode we return a
        // thenable which warns if it's called.
        return DEV_MODE
            ? requestUpdateThenable(this.localName)
            : undefined;
    }
    /**
     * Sets up the element to asynchronously update.
     */
    async __enqueueUpdate() {
        this.isUpdatePending = true;
        try {
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await this.__updatePromise;
        }
        catch (e) {
            // Refire any previous errors async so they do not disrupt the update
            // cycle. Errors are refired so developers have a chance to observe
            // them, and this can be done by implementing
            // `window.onunhandledrejection`.
            Promise.reject(e);
        }
        const result = this.scheduleUpdate();
        // If `scheduleUpdate` returns a Promise, we await it. This is done to
        // enable coordinating updates with a scheduler. Note, the result is
        // checked to avoid delaying an additional microtask unless we need to.
        if (result != null) {
            await result;
        }
        return !this.isUpdatePending;
    }
    /**
     * Schedules an element update. You can override this method to change the
     * timing of updates by returning a Promise. The update will await the
     * returned Promise, and you should resolve the Promise to allow the update
     * to proceed. If this method is overridden, `super.scheduleUpdate()`
     * must be called.
     *
     * For instance, to schedule updates to occur just before the next frame:
     *
     * ```ts
     * override protected async scheduleUpdate(): Promise<unknown> {
     *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
     *   super.scheduleUpdate();
     * }
     * ```
     * @category updates
     */
    scheduleUpdate() {
        return this.performUpdate();
    }
    /**
     * Performs an element update. Note, if an exception is thrown during the
     * update, `firstUpdated` and `updated` will not be called.
     *
     * Call `performUpdate()` to immediately process a pending update. This should
     * generally not be needed, but it can be done in rare cases when you need to
     * update synchronously.
     *
     * Note: To ensure `performUpdate()` synchronously completes a pending update,
     * it should not be overridden. In LitElement 2.x it was suggested to override
     * `performUpdate()` to also customizing update scheduling. Instead, you should now
     * override `scheduleUpdate()`. For backwards compatibility with LitElement 2.x,
     * scheduling updates via `performUpdate()` continues to work, but will make
     * also calling `performUpdate()` to synchronously process updates difficult.
     *
     * @category updates
     */
    performUpdate() {
        var _a, _b;
        // Abort any update if one is not pending when this is called.
        // This can happen if `performUpdate` is called early to "flush"
        // the update.
        if (!this.isUpdatePending) {
            return;
        }
        // create renderRoot before first update.
        if (!this.hasUpdated) {
            // Produce warning if any class properties are shadowed by class fields
            if (DEV_MODE) {
                const shadowedProperties = [];
                (_a = this.constructor.__reactivePropertyKeys) === null || _a === void 0 ? void 0 : _a.forEach((p) => {
                    var _a;
                    if (this.hasOwnProperty(p) && !((_a = this.__instanceProperties) === null || _a === void 0 ? void 0 : _a.has(p))) {
                        shadowedProperties.push(p);
                    }
                });
                if (shadowedProperties.length) {
                    throw new Error(`The following properties on element ${this.localName} will not ` +
                        `trigger updates as expected because they are set using class ` +
                        `fields: ${shadowedProperties.join(', ')}. ` +
                        `Native class fields and some compiled output will overwrite ` +
                        `accessors used for detecting changes. See ` +
                        `https://lit.dev/msg/class-field-shadowing ` +
                        `for more information.`);
                }
            }
        }
        // Mixin instance properties once, if they exist.
        if (this.__instanceProperties) {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.__instanceProperties.forEach((v, p) => (this[p] = v));
            this.__instanceProperties = undefined;
        }
        let shouldUpdate = false;
        const changedProperties = this._$changedProperties;
        try {
            shouldUpdate = this.shouldUpdate(changedProperties);
            if (shouldUpdate) {
                this.willUpdate(changedProperties);
                (_b = this.__controllers) === null || _b === void 0 ? void 0 : _b.forEach((c) => { var _a; return (_a = c.hostUpdate) === null || _a === void 0 ? void 0 : _a.call(c); });
                this.update(changedProperties);
            }
            else {
                this.__markUpdated();
            }
        }
        catch (e) {
            // Prevent `firstUpdated` and `updated` from running when there's an
            // update exception.
            shouldUpdate = false;
            // Ensure element can accept additional updates after an exception.
            this.__markUpdated();
            throw e;
        }
        // The update is no longer considered pending and further updates are now allowed.
        if (shouldUpdate) {
            this._$didUpdate(changedProperties);
        }
    }
    /**
     * @category updates
     */
    willUpdate(_changedProperties) { }
    // Note, this is an override point for polyfill-support.
    // @internal
    _$didUpdate(changedProperties) {
        var _a;
        (_a = this.__controllers) === null || _a === void 0 ? void 0 : _a.forEach((c) => { var _a; return (_a = c.hostUpdated) === null || _a === void 0 ? void 0 : _a.call(c); });
        if (!this.hasUpdated) {
            this.hasUpdated = true;
            this.firstUpdated(changedProperties);
        }
        this.updated(changedProperties);
        if (DEV_MODE &&
            this.isUpdatePending &&
            this.constructor.enabledWarnings.indexOf('change-in-update') >= 0) {
            issueWarning('change-in-update', `Element ${this.localName} scheduled an update ` +
                `(generally because a property was set) ` +
                `after an update completed, causing a new update to be scheduled. ` +
                `This is inefficient and should be avoided unless the next update ` +
                `can only be scheduled as a side effect of the previous update.`);
        }
    }
    __markUpdated() {
        this._$changedProperties = new Map();
        this.isUpdatePending = false;
    }
    /**
     * Returns a Promise that resolves when the element has completed updating.
     * The Promise value is a boolean that is `true` if the element completed the
     * update without triggering another update. The Promise result is `false` if
     * a property was set inside `updated()`. If the Promise is rejected, an
     * exception was thrown during the update.
     *
     * To await additional asynchronous work, override the `getUpdateComplete`
     * method. For example, it is sometimes useful to await a rendered element
     * before fulfilling this Promise. To do this, first await
     * `super.getUpdateComplete()`, then any subsequent state.
     *
     * @return A promise of a boolean that resolves to true if the update completed
     *     without triggering another update.
     * @category updates
     */
    get updateComplete() {
        return this.getUpdateComplete();
    }
    /**
     * Override point for the `updateComplete` promise.
     *
     * It is not safe to override the `updateComplete` getter directly due to a
     * limitation in TypeScript which means it is not possible to call a
     * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
     * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
     * This method should be overridden instead. For example:
     *
     * ```ts
     * class MyElement extends LitElement {
     *   override async getUpdateComplete() {
     *     const result = await super.getUpdateComplete();
     *     await this._myChild.updateComplete;
     *     return result;
     *   }
     * }
     * ```
     *
     * @return A promise of a boolean that resolves to true if the update completed
     *     without triggering another update.
     * @category updates
     */
    getUpdateComplete() {
        return this.__updatePromise;
    }
    /**
     * Controls whether or not `update()` should be called when the element requests
     * an update. By default, this method always returns `true`, but this can be
     * customized to control when to update.
     *
     * @param _changedProperties Map of changed properties with old values
     * @category updates
     */
    shouldUpdate(_changedProperties) {
        return true;
    }
    /**
     * Updates the element. This method reflects property values to attributes.
     * It can be overridden to render and keep updated element DOM.
     * Setting properties inside this method will *not* trigger
     * another update.
     *
     * @param _changedProperties Map of changed properties with old values
     * @category updates
     */
    update(_changedProperties) {
        if (this.__reflectingProperties !== undefined) {
            // Use forEach so this works even if for/of loops are compiled to for
            // loops expecting arrays
            this.__reflectingProperties.forEach((v, k) => this.__propertyToAttribute(k, this[k], v));
            this.__reflectingProperties = undefined;
        }
        this.__markUpdated();
    }
    /**
     * Invoked whenever the element is updated. Implement to perform
     * post-updating tasks via DOM APIs, for example, focusing an element.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     * @category updates
     */
    updated(_changedProperties) { }
    /**
     * Invoked when the element is first updated. Implement to perform one time
     * work on the element after update.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     * @category updates
     */
    firstUpdated(_changedProperties) { }
}
_d = finalized;
/**
 * Marks class as having finished creating properties.
 */
ReactiveElement[_d] = true;
/**
 * Memoized list of all element properties, including any superclass properties.
 * Created lazily on user subclasses when finalizing the class.
 * @nocollapse
 * @category properties
 */
ReactiveElement.elementProperties = new Map();
/**
 * Memoized list of all element styles.
 * Created lazily on user subclasses when finalizing the class.
 * @nocollapse
 * @category styles
 */
ReactiveElement.elementStyles = [];
/**
 * Options used when calling `attachShadow`. Set this property to customize
 * the options for the shadowRoot; for example, to create a closed
 * shadowRoot: `{mode: 'closed'}`.
 *
 * Note, these options are used in `createRenderRoot`. If this method
 * is customized, options should be respected if possible.
 * @nocollapse
 * @category rendering
 */
ReactiveElement.shadowRootOptions = { mode: 'open' };
// Apply polyfills if available
polyfillSupport === null || polyfillSupport === void 0 ? void 0 : polyfillSupport({ ReactiveElement });
// Dev mode warnings...
if (DEV_MODE) {
    // Default warning set.
    ReactiveElement.enabledWarnings = ['change-in-update'];
    const ensureOwnWarnings = function (ctor) {
        if (!ctor.hasOwnProperty(JSCompiler_renameProperty('enabledWarnings', ctor))) {
            ctor.enabledWarnings = ctor.enabledWarnings.slice();
        }
    };
    ReactiveElement.enableWarning = function (warning) {
        ensureOwnWarnings(this);
        if (this.enabledWarnings.indexOf(warning) < 0) {
            this.enabledWarnings.push(warning);
        }
    };
    ReactiveElement.disableWarning = function (warning) {
        ensureOwnWarnings(this);
        const i = this.enabledWarnings.indexOf(warning);
        if (i >= 0) {
            this.enabledWarnings.splice(i, 1);
        }
    };
}
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for ReactiveElement usage.
((_c = globalThis.reactiveElementVersions) !== null && _c !== void 0 ? _c : (globalThis.reactiveElementVersions = [])).push('1.2.0');
if (DEV_MODE && globalThis.reactiveElementVersions.length > 1) {
    issueWarning('multiple-versions', `Multiple versions of Lit loaded. Loading multiple versions ` +
        `is not recommended.`);
}
//# sourceMappingURL=reactive-element.js.map

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

/***/ "./node_modules/lit-element/development/lit-element.js":
/*!*************************************************************!*\
  !*** ./node_modules/lit-element/development/lit-element.js ***!
  \*************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "CSSResult": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.CSSResult),
/* harmony export */   "ReactiveElement": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.ReactiveElement),
/* harmony export */   "adoptStyles": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.adoptStyles),
/* harmony export */   "css": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.css),
/* harmony export */   "defaultConverter": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.defaultConverter),
/* harmony export */   "getCompatibleStyle": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.getCompatibleStyle),
/* harmony export */   "notEqual": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.notEqual),
/* harmony export */   "supportsAdoptingStyleSheets": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.supportsAdoptingStyleSheets),
/* harmony export */   "unsafeCSS": () => (/* reexport safe */ _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.unsafeCSS),
/* harmony export */   "INTERNAL": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.INTERNAL),
/* harmony export */   "_$LH": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__._$LH),
/* harmony export */   "html": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.html),
/* harmony export */   "noChange": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.noChange),
/* harmony export */   "nothing": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.nothing),
/* harmony export */   "render": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.render),
/* harmony export */   "svg": () => (/* reexport safe */ lit_html__WEBPACK_IMPORTED_MODULE_1__.svg),
/* harmony export */   "UpdatingElement": () => (/* binding */ UpdatingElement),
/* harmony export */   "LitElement": () => (/* binding */ LitElement),
/* harmony export */   "_$LE": () => (/* binding */ _$LE)
/* harmony export */ });
/* harmony import */ var _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @lit/reactive-element */ "./node_modules/@lit/reactive-element/development/reactive-element.js");
/* harmony import */ var lit_html__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit-html */ "./node_modules/lit-html/development/lit-html.js");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a, _b, _c;
/**
 * The main LitElement module, which defines the [[`LitElement`]] base class and
 * related APIs.
 *
 *  LitElement components can define a template and a set of observed
 * properties. Changing an observed property triggers a re-render of the
 * element.
 *
 *  Import [[`LitElement`]] and [[`html`]] from this module to create a
 * component:
 *
 *  ```js
 * import {LitElement, html} from 'lit-element';
 *
 * class MyElement extends LitElement {
 *
 *   // Declare observed properties
 *   static get properties() {
 *     return {
 *       adjective: {}
 *     }
 *   }
 *
 *   constructor() {
 *     this.adjective = 'awesome';
 *   }
 *
 *   // Define the element's template
 *   render() {
 *     return html`<p>your ${adjective} template here</p>`;
 *   }
 * }
 *
 * customElements.define('my-element', MyElement);
 * ```
 *
 * `LitElement` extends [[`ReactiveElement`]] and adds lit-html templating.
 * The `ReactiveElement` class is provided for users that want to build
 * their own custom element base classes that don't use lit-html.
 *
 * @packageDocumentation
 */




// For backwards compatibility export ReactiveElement as UpdatingElement. Note,
// IE transpilation requires exporting like this.
const UpdatingElement = _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.ReactiveElement;
const DEV_MODE = true;
let issueWarning;
if (DEV_MODE) {
    // Ensure warnings are issued only 1x, even if multiple versions of Lit
    // are loaded.
    const issuedWarnings = ((_a = globalThis.litIssuedWarnings) !== null && _a !== void 0 ? _a : (globalThis.litIssuedWarnings = new Set()));
    // Issue a warning, if we haven't already.
    issueWarning = (code, warning) => {
        warning += ` See https://lit.dev/msg/${code} for more information.`;
        if (!issuedWarnings.has(warning)) {
            console.warn(warning);
            issuedWarnings.add(warning);
        }
    };
}
/**
 * Base element class that manages element properties and attributes, and
 * renders a lit-html template.
 *
 * To define a component, subclass `LitElement` and implement a
 * `render` method to provide the component's template. Define properties
 * using the [[`properties`]] property or the [[`property`]] decorator.
 */
class LitElement extends _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.ReactiveElement {
    constructor() {
        super(...arguments);
        /**
         * @category rendering
         */
        this.renderOptions = { host: this };
        this.__childPart = undefined;
    }
    /**
     * @category rendering
     */
    createRenderRoot() {
        var _a;
        var _b;
        const renderRoot = super.createRenderRoot();
        // When adoptedStyleSheets are shimmed, they are inserted into the
        // shadowRoot by createRenderRoot. Adjust the renderBefore node so that
        // any styles in Lit content render before adoptedStyleSheets. This is
        // important so that adoptedStyleSheets have precedence over styles in
        // the shadowRoot.
        (_a = (_b = this.renderOptions).renderBefore) !== null && _a !== void 0 ? _a : (_b.renderBefore = renderRoot.firstChild);
        return renderRoot;
    }
    /**
     * Updates the element. This method reflects property values to attributes
     * and calls `render` to render DOM via lit-html. Setting properties inside
     * this method will *not* trigger another update.
     * @param changedProperties Map of changed properties with old values
     * @category updates
     */
    update(changedProperties) {
        // Setting properties in `render` should not trigger an update. Since
        // updates are allowed after super.update, it's important to call `render`
        // before that.
        const value = this.render();
        if (!this.hasUpdated) {
            this.renderOptions.isConnected = this.isConnected;
        }
        super.update(changedProperties);
        this.__childPart = (0,lit_html__WEBPACK_IMPORTED_MODULE_1__.render)(value, this.renderRoot, this.renderOptions);
    }
    /**
     * Invoked when the component is added to the document's DOM.
     *
     * In `connectedCallback()` you should setup tasks that should only occur when
     * the element is connected to the document. The most common of these is
     * adding event listeners to nodes external to the element, like a keydown
     * event handler added to the window.
     *
     * ```ts
     * connectedCallback() {
     *   super.connectedCallback();
     *   addEventListener('keydown', this._handleKeydown);
     * }
     * ```
     *
     * Typically, anything done in `connectedCallback()` should be undone when the
     * element is disconnected, in `disconnectedCallback()`.
     *
     * @category lifecycle
     */
    connectedCallback() {
        var _a;
        super.connectedCallback();
        (_a = this.__childPart) === null || _a === void 0 ? void 0 : _a.setConnected(true);
    }
    /**
     * Invoked when the component is removed from the document's DOM.
     *
     * This callback is the main signal to the element that it may no longer be
     * used. `disconnectedCallback()` should ensure that nothing is holding a
     * reference to the element (such as event listeners added to nodes external
     * to the element), so that it is free to be garbage collected.
     *
     * ```ts
     * disconnectedCallback() {
     *   super.disconnectedCallback();
     *   window.removeEventListener('keydown', this._handleKeydown);
     * }
     * ```
     *
     * An element may be re-connected after being disconnected.
     *
     * @category lifecycle
     */
    disconnectedCallback() {
        var _a;
        super.disconnectedCallback();
        (_a = this.__childPart) === null || _a === void 0 ? void 0 : _a.setConnected(false);
    }
    /**
     * Invoked on each update to perform rendering tasks. This method may return
     * any value renderable by lit-html's `ChildPart` - typically a
     * `TemplateResult`. Setting properties inside this method will *not* trigger
     * the element to update.
     * @category rendering
     */
    render() {
        return lit_html__WEBPACK_IMPORTED_MODULE_1__.noChange;
    }
}
/**
 * Ensure this class is marked as `finalized` as an optimization ensuring
 * it will not needlessly try to `finalize`.
 *
 * Note this property name is a string to prevent breaking Closure JS Compiler
 * optimizations. See @lit/reactive-element for more information.
 */
LitElement['finalized'] = true;
// This property needs to remain unminified.
LitElement['_$litElement$'] = true;
// Install hydration if available
(_b = globalThis.litElementHydrateSupport) === null || _b === void 0 ? void 0 : _b.call(globalThis, { LitElement });
// Apply polyfills if available
const polyfillSupport = DEV_MODE
    ? globalThis.litElementPolyfillSupportDevMode
    : globalThis.litElementPolyfillSupport;
polyfillSupport === null || polyfillSupport === void 0 ? void 0 : polyfillSupport({ LitElement });
// DEV mode warnings
if (DEV_MODE) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Note, for compatibility with closure compilation, this access
    // needs to be as a string property index.
    LitElement['finalize'] = function () {
        const finalized = _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__.ReactiveElement.finalize.call(this);
        if (!finalized) {
            return false;
        }
        const warnRemovedOrRenamed = (obj, name, renamed = false) => {
            if (obj.hasOwnProperty(name)) {
                const ctorName = (typeof obj === 'function' ? obj : obj.constructor)
                    .name;
                issueWarning(renamed ? 'renamed-api' : 'removed-api', `\`${name}\` is implemented on class ${ctorName}. It ` +
                    `has been ${renamed ? 'renamed' : 'removed'} ` +
                    `in this version of LitElement.`);
            }
        };
        warnRemovedOrRenamed(this, 'render');
        warnRemovedOrRenamed(this, 'getStyles', true);
        warnRemovedOrRenamed(this.prototype, 'adoptStyles');
        return true;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
/**
 * END USERS SHOULD NOT RELY ON THIS OBJECT.
 *
 * Private exports for use by other Lit packages, not intended for use by
 * external users.
 *
 * We currently do not make a mangled rollup build of the lit-ssr code. In order
 * to keep a number of (otherwise private) top-level exports  mangled in the
 * client side code, we export a _$LE object containing those members (or
 * helper methods for accessing private fields of those members), and then
 * re-export them for use in lit-ssr. This keeps lit-ssr agnostic to whether the
 * client-side code is being used in `dev` mode or `prod` mode.
 *
 * This has a unique name, to disambiguate it from private exports in
 * lit-html, since this module re-exports all of lit-html.
 *
 * @private
 */
const _$LE = {
    _$attributeToProperty: (el, name, value) => {
        // eslint-disable-next-line
        el._$attributeToProperty(name, value);
    },
    // eslint-disable-next-line
    _$changedProperties: (el) => el._$changedProperties,
};
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for LitElement usage.
((_c = globalThis.litElementVersions) !== null && _c !== void 0 ? _c : (globalThis.litElementVersions = [])).push('3.1.1');
if (DEV_MODE && globalThis.litElementVersions.length > 1) {
    issueWarning('multiple-versions', `Multiple versions of Lit loaded. Loading multiple versions ` +
        `is not recommended.`);
}
//# sourceMappingURL=lit-element.js.map

/***/ }),

/***/ "./node_modules/lit-html/development/directive.js":
/*!********************************************************!*\
  !*** ./node_modules/lit-html/development/directive.js ***!
  \********************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "PartType": () => (/* binding */ PartType),
/* harmony export */   "directive": () => (/* binding */ directive),
/* harmony export */   "Directive": () => (/* binding */ Directive)
/* harmony export */ });
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const PartType = {
    ATTRIBUTE: 1,
    CHILD: 2,
    PROPERTY: 3,
    BOOLEAN_ATTRIBUTE: 4,
    EVENT: 5,
    ELEMENT: 6,
};
/**
 * Creates a user-facing directive function from a Directive class. This
 * function has the same parameters as the directive's render() method.
 */
const directive = (c) => (...values) => ({
    // This property needs to remain unminified.
    ['_$litDirective$']: c,
    values,
});
/**
 * Base class for creating custom directives. Users should extend this class,
 * implement `render` and/or `update`, and then pass their subclass to
 * `directive`.
 */
class Directive {
    constructor(_partInfo) { }
    // See comment in Disconnectable interface for why this is a getter
    get _$isConnected() {
        return this._$parent._$isConnected;
    }
    /** @internal */
    _$initialize(part, parent, attributeIndex) {
        this.__part = part;
        this._$parent = parent;
        this.__attributeIndex = attributeIndex;
    }
    /** @internal */
    _$resolve(part, props) {
        return this.update(part, props);
    }
    update(_part, props) {
        return this.render(...props);
    }
}
//# sourceMappingURL=directive.js.map

/***/ }),

/***/ "./node_modules/lit-html/development/directives/style-map.js":
/*!*******************************************************************!*\
  !*** ./node_modules/lit-html/development/directives/style-map.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "styleMap": () => (/* binding */ styleMap)
/* harmony export */ });
/* harmony import */ var _lit_html_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../lit-html.js */ "./node_modules/lit-html/development/lit-html.js");
/* harmony import */ var _directive_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../directive.js */ "./node_modules/lit-html/development/directive.js");
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */


class StyleMapDirective extends _directive_js__WEBPACK_IMPORTED_MODULE_1__.Directive {
    constructor(partInfo) {
        var _a;
        super(partInfo);
        if (partInfo.type !== _directive_js__WEBPACK_IMPORTED_MODULE_1__.PartType.ATTRIBUTE ||
            partInfo.name !== 'style' ||
            ((_a = partInfo.strings) === null || _a === void 0 ? void 0 : _a.length) > 2) {
            throw new Error('The `styleMap` directive must be used in the `style` attribute ' +
                'and must be the only part in the attribute.');
        }
    }
    render(styleInfo) {
        return Object.keys(styleInfo).reduce((style, prop) => {
            const value = styleInfo[prop];
            if (value == null) {
                return style;
            }
            // Convert property names from camel-case to dash-case, i.e.:
            //  `backgroundColor` -> `background-color`
            // Vendor-prefixed names need an extra `-` appended to front:
            //  `webkitAppearance` -> `-webkit-appearance`
            // Exception is any property name containing a dash, including
            // custom properties; we assume these are already dash-cased i.e.:
            //  `--my-button-color` --> `--my-button-color`
            prop = prop
                .replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, '-$&')
                .toLowerCase();
            return style + `${prop}:${value};`;
        }, '');
    }
    update(part, [styleInfo]) {
        const { style } = part.element;
        if (this._previousStyleProperties === undefined) {
            this._previousStyleProperties = new Set();
            for (const name in styleInfo) {
                this._previousStyleProperties.add(name);
            }
            return this.render(styleInfo);
        }
        // Remove old properties that no longer exist in styleInfo
        // We use forEach() instead of for-of so that re don't require down-level
        // iteration.
        this._previousStyleProperties.forEach((name) => {
            // If the name isn't in styleInfo or it's null/undefined
            if (styleInfo[name] == null) {
                this._previousStyleProperties.delete(name);
                if (name.includes('-')) {
                    style.removeProperty(name);
                }
                else {
                    // Note reset using empty string (vs null) as IE11 does not always
                    // reset via null (https://developer.mozilla.org/en-US/docs/Web/API/ElementCSSInlineStyle/style#setting_styles)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    style[name] = '';
                }
            }
        });
        // Add or update properties
        for (const name in styleInfo) {
            const value = styleInfo[name];
            if (value != null) {
                this._previousStyleProperties.add(name);
                if (name.includes('-')) {
                    style.setProperty(name, value);
                }
                else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    style[name] = value;
                }
            }
        }
        return _lit_html_js__WEBPACK_IMPORTED_MODULE_0__.noChange;
    }
}
/**
 * A directive that applies CSS properties to an element.
 *
 * `styleMap` can only be used in the `style` attribute and must be the only
 * expression in the attribute. It takes the property names in the `styleInfo`
 * object and adds the property values as CSS properties. Property names with
 * dashes (`-`) are assumed to be valid CSS property names and set on the
 * element's style object using `setProperty()`. Names without dashes are
 * assumed to be camelCased JavaScript property names and set on the element's
 * style object using property assignment, allowing the style object to
 * translate JavaScript-style names to CSS property names.
 *
 * For example `styleMap({backgroundColor: 'red', 'border-top': '5px', '--size':
 * '0'})` sets the `background-color`, `border-top` and `--size` properties.
 *
 * @param styleInfo
 */
const styleMap = (0,_directive_js__WEBPACK_IMPORTED_MODULE_1__.directive)(StyleMapDirective);
//# sourceMappingURL=style-map.js.map

/***/ }),

/***/ "./node_modules/lit-html/development/lit-html.js":
/*!*******************************************************!*\
  !*** ./node_modules/lit-html/development/lit-html.js ***!
  \*******************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "INTERNAL": () => (/* binding */ INTERNAL),
/* harmony export */   "html": () => (/* binding */ html),
/* harmony export */   "svg": () => (/* binding */ svg),
/* harmony export */   "noChange": () => (/* binding */ noChange),
/* harmony export */   "nothing": () => (/* binding */ nothing),
/* harmony export */   "render": () => (/* binding */ render),
/* harmony export */   "_$LH": () => (/* binding */ _$LH)
/* harmony export */ });
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var _a, _b, _c, _d;
const DEV_MODE = true;
const ENABLE_EXTRA_SECURITY_HOOKS = true;
const ENABLE_SHADYDOM_NOPATCH = true;
/**
 * `true` if we're building for google3 with temporary back-compat helpers.
 * This export is not present in prod builds.
 * @internal
 */
const INTERNAL = true;
let issueWarning;
if (DEV_MODE) {
    (_a = globalThis.litIssuedWarnings) !== null && _a !== void 0 ? _a : (globalThis.litIssuedWarnings = new Set());
    // Issue a warning, if we haven't already.
    issueWarning = (code, warning) => {
        warning += code
            ? ` See https://lit.dev/msg/${code} for more information.`
            : '';
        if (!globalThis.litIssuedWarnings.has(warning)) {
            console.warn(warning);
            globalThis.litIssuedWarnings.add(warning);
        }
    };
    issueWarning('dev-mode', `Lit is in dev mode. Not recommended for production!`);
}
const wrap = ENABLE_SHADYDOM_NOPATCH &&
    ((_b = window.ShadyDOM) === null || _b === void 0 ? void 0 : _b.inUse) &&
    ((_c = window.ShadyDOM) === null || _c === void 0 ? void 0 : _c.noPatch) === true
    ? window.ShadyDOM.wrap
    : (node) => node;
const trustedTypes = globalThis.trustedTypes;
/**
 * Our TrustedTypePolicy for HTML which is declared using the html template
 * tag function.
 *
 * That HTML is a developer-authored constant, and is parsed with innerHTML
 * before any untrusted expressions have been mixed in. Therefor it is
 * considered safe by construction.
 */
const policy = trustedTypes
    ? trustedTypes.createPolicy('lit-html', {
        createHTML: (s) => s,
    })
    : undefined;
const identityFunction = (value) => value;
const noopSanitizer = (_node, _name, _type) => identityFunction;
/** Sets the global sanitizer factory. */
const setSanitizer = (newSanitizer) => {
    if (!ENABLE_EXTRA_SECURITY_HOOKS) {
        return;
    }
    if (sanitizerFactoryInternal !== noopSanitizer) {
        throw new Error(`Attempted to overwrite existing lit-html security policy.` +
            ` setSanitizeDOMValueFactory should be called at most once.`);
    }
    sanitizerFactoryInternal = newSanitizer;
};
/**
 * Only used in internal tests, not a part of the public API.
 */
const _testOnlyClearSanitizerFactoryDoNotCallOrElse = () => {
    sanitizerFactoryInternal = noopSanitizer;
};
const createSanitizer = (node, name, type) => {
    return sanitizerFactoryInternal(node, name, type);
};
// Added to an attribute name to mark the attribute as bound so we can find
// it easily.
const boundAttributeSuffix = '$lit$';
// This marker is used in many syntactic positions in HTML, so it must be
// a valid element name and attribute name. We don't support dynamic names (yet)
// but this at least ensures that the parse tree is closer to the template
// intention.
const marker = `lit$${String(Math.random()).slice(9)}$`;
// String used to tell if a comment is a marker comment
const markerMatch = '?' + marker;
// Text used to insert a comment marker node. We use processing instruction
// syntax because it's slightly smaller, but parses as a comment node.
const nodeMarker = `<${markerMatch}>`;
const d = document;
// Creates a dynamic marker. We never have to search for these in the DOM.
const createMarker = (v = '') => d.createComment(v);
const isPrimitive = (value) => value === null || (typeof value != 'object' && typeof value != 'function');
const isArray = Array.isArray;
const isIterable = (value) => {
    var _a;
    return isArray(value) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof ((_a = value) === null || _a === void 0 ? void 0 : _a[Symbol.iterator]) === 'function';
};
const SPACE_CHAR = `[ \t\n\f\r]`;
const ATTR_VALUE_CHAR = `[^ \t\n\f\r"'\`<>=]`;
const NAME_CHAR = `[^\\s"'>=/]`;
// These regexes represent the five parsing states that we care about in the
// Template's HTML scanner. They match the *end* of the state they're named
// after.
// Depending on the match, we transition to a new state. If there's no match,
// we stay in the same state.
// Note that the regexes are stateful. We utilize lastIndex and sync it
// across the multiple regexes used. In addition to the five regexes below
// we also dynamically create a regex to find the matching end tags for raw
// text elements.
/**
 * End of text is: `<` followed by:
 *   (comment start) or (tag) or (dynamic tag binding)
 */
const textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
const COMMENT_START = 1;
const TAG_NAME = 2;
const DYNAMIC_TAG_NAME = 3;
const commentEndRegex = /-->/g;
/**
 * Comments not started with <!--, like </{, can be ended by a single `>`
 */
const comment2EndRegex = />/g;
/**
 * The tagEnd regex matches the end of the "inside an opening" tag syntax
 * position. It either matches a `>`, an attribute-like sequence, or the end
 * of the string after a space (attribute-name position ending).
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \t\n\f\r" are HTML space characters:
 * https://infra.spec.whatwg.org/#ascii-whitespace
 *
 * So an attribute is:
 *  * The name: any character except a whitespace character, ("), ('), ">",
 *    "=", or "/". Note: this is different from the HTML spec which also excludes control characters.
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const tagEndRegex = new RegExp(`>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`, 'g');
const ENTIRE_MATCH = 0;
const ATTRIBUTE_NAME = 1;
const SPACES_AND_EQUALS = 2;
const QUOTE_CHAR = 3;
const singleQuoteAttrEndRegex = /'/g;
const doubleQuoteAttrEndRegex = /"/g;
/**
 * Matches the raw text elements.
 *
 * Comments are not parsed within raw text elements, so we need to search their
 * text content for marker strings.
 */
const rawTextElement = /^(?:script|style|textarea)$/i;
/** TemplateResult types */
const HTML_RESULT = 1;
const SVG_RESULT = 2;
// TemplatePart types
// IMPORTANT: these must match the values in PartType
const ATTRIBUTE_PART = 1;
const CHILD_PART = 2;
const PROPERTY_PART = 3;
const BOOLEAN_ATTRIBUTE_PART = 4;
const EVENT_PART = 5;
const ELEMENT_PART = 6;
const COMMENT_PART = 7;
/**
 * Generates a template literal tag function that returns a TemplateResult with
 * the given result type.
 */
const tag = (type) => (strings, ...values) => {
    // Warn against templates octal escape sequences
    // We do this here rather than in render so that the warning is closer to the
    // template definition.
    if (DEV_MODE && strings.some((s) => s === undefined)) {
        console.warn('Some template strings are undefined.\n' +
            'This is probably caused by illegal octal escape sequences.');
    }
    return {
        // This property needs to remain unminified.
        ['_$litType$']: type,
        strings,
        values,
    };
};
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 *
 * ```ts
 * const header = (title: string) => html`<h1>${title}</h1>`;
 * ```
 *
 * The `html` tag returns a description of the DOM to render as a value. It is
 * lazy, meaning no work is done until the template is rendered. When rendering,
 * if a template comes from the same expression as a previously rendered result,
 * it's efficiently updated instead of replaced.
 */
const html = tag(HTML_RESULT);
/**
 * Interprets a template literal as an SVG template that can efficiently
 * render to and update a container.
 */
const svg = tag(SVG_RESULT);
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = Symbol.for('lit-noChange');
/**
 * A sentinel value that signals a ChildPart to fully clear its content.
 *
 * ```ts
 * const button = html`${
 *  user.isAdmin
 *    ? html`<button>DELETE</button>`
 *    : nothing
 * }`;
 * ```
 *
 * Prefer using `nothing` over other falsy values as it provides a consistent
 * behavior between various expression binding contexts.
 *
 * In child expressions, `undefined`, `null`, `''`, and `nothing` all behave the
 * same and render no nodes. In attribute expressions, `nothing` _removes_ the
 * attribute, while `undefined` and `null` will render an empty string. In
 * property expressions `nothing` becomes `undefined`.
 */
const nothing = Symbol.for('lit-nothing');
/**
 * The cache of prepared templates, keyed by the tagged TemplateStringsArray
 * and _not_ accounting for the specific template tag used. This means that
 * template tags cannot be dynamic - the must statically be one of html, svg,
 * or attr. This restriction simplifies the cache lookup, which is on the hot
 * path for rendering.
 */
const templateCache = new WeakMap();
/**
 * Renders a value, usually a lit-html TemplateResult, to the container.
 * @param value
 * @param container
 * @param options
 */
const render = (value, container, options) => {
    var _a, _b, _c;
    const partOwnerNode = (_a = options === null || options === void 0 ? void 0 : options.renderBefore) !== null && _a !== void 0 ? _a : container;
    // This property needs to remain unminified.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let part = partOwnerNode['_$litPart$'];
    if (part === undefined) {
        const endNode = (_b = options === null || options === void 0 ? void 0 : options.renderBefore) !== null && _b !== void 0 ? _b : null;
        // Internal modification: don't clear container to match lit-html 2.0
        if (INTERNAL &&
            ((_c = options) === null || _c === void 0 ? void 0 : _c.clearContainerForLit2MigrationOnly) ===
                true) {
            let n = container.firstChild;
            // Clear only up to the `endNode` aka `renderBefore` node.
            while (n && n !== endNode) {
                const next = n.nextSibling;
                n.remove();
                n = next;
            }
        }
        // This property needs to remain unminified.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partOwnerNode['_$litPart$'] = part = new ChildPart(container.insertBefore(createMarker(), endNode), endNode, undefined, options !== null && options !== void 0 ? options : {});
    }
    part._$setValue(value);
    return part;
};
if (ENABLE_EXTRA_SECURITY_HOOKS) {
    render.setSanitizer = setSanitizer;
    render.createSanitizer = createSanitizer;
    if (DEV_MODE) {
        render._testOnlyClearSanitizerFactoryDoNotCallOrElse =
            _testOnlyClearSanitizerFactoryDoNotCallOrElse;
    }
}
const walker = d.createTreeWalker(d, 129 /* NodeFilter.SHOW_{ELEMENT|COMMENT} */, null, false);
let sanitizerFactoryInternal = noopSanitizer;
/**
 * Returns an HTML string for the given TemplateStringsArray and result type
 * (HTML or SVG), along with the case-sensitive bound attribute names in
 * template order. The HTML contains comment comment markers denoting the
 * `ChildPart`s and suffixes on bound attributes denoting the `AttributeParts`.
 *
 * @param strings template strings array
 * @param type HTML or SVG
 * @return Array containing `[html, attrNames]` (array returned for terseness,
 *     to avoid object fields since this code is shared with non-minified SSR
 *     code)
 */
const getTemplateHtml = (strings, type) => {
    // Insert makers into the template HTML to represent the position of
    // bindings. The following code scans the template strings to determine the
    // syntactic position of the bindings. They can be in text position, where
    // we insert an HTML comment, attribute value position, where we insert a
    // sentinel string and re-write the attribute name, or inside a tag where
    // we insert the sentinel string.
    const l = strings.length - 1;
    // Stores the case-sensitive bound attribute names in the order of their
    // parts. ElementParts are also reflected in this array as undefined
    // rather than a string, to disambiguate from attribute bindings.
    const attrNames = [];
    let html = type === SVG_RESULT ? '<svg>' : '';
    // When we're inside a raw text tag (not it's text content), the regex
    // will still be tagRegex so we can find attributes, but will switch to
    // this regex when the tag ends.
    let rawTextEndRegex;
    // The current parsing state, represented as a reference to one of the
    // regexes
    let regex = textEndRegex;
    for (let i = 0; i < l; i++) {
        const s = strings[i];
        // The index of the end of the last attribute name. When this is
        // positive at end of a string, it means we're in an attribute value
        // position and need to rewrite the attribute name.
        // We also use a special value of -2 to indicate that we encountered
        // the end of a string in attribute name position.
        let attrNameEndIndex = -1;
        let attrName;
        let lastIndex = 0;
        let match;
        // The conditions in this loop handle the current parse state, and the
        // assignments to the `regex` variable are the state transitions.
        while (lastIndex < s.length) {
            // Make sure we start searching from where we previously left off
            regex.lastIndex = lastIndex;
            match = regex.exec(s);
            if (match === null) {
                break;
            }
            lastIndex = regex.lastIndex;
            if (regex === textEndRegex) {
                if (match[COMMENT_START] === '!--') {
                    regex = commentEndRegex;
                }
                else if (match[COMMENT_START] !== undefined) {
                    // We started a weird comment, like </{
                    regex = comment2EndRegex;
                }
                else if (match[TAG_NAME] !== undefined) {
                    if (rawTextElement.test(match[TAG_NAME])) {
                        // Record if we encounter a raw-text element. We'll switch to
                        // this regex at the end of the tag.
                        rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, 'g');
                    }
                    regex = tagEndRegex;
                }
                else if (match[DYNAMIC_TAG_NAME] !== undefined) {
                    if (DEV_MODE) {
                        throw new Error('Bindings in tag names are not supported. Please use static templates instead. ' +
                            'See https://lit.dev/docs/templates/expressions/#static-expressions');
                    }
                    regex = tagEndRegex;
                }
            }
            else if (regex === tagEndRegex) {
                if (match[ENTIRE_MATCH] === '>') {
                    // End of a tag. If we had started a raw-text element, use that
                    // regex
                    regex = rawTextEndRegex !== null && rawTextEndRegex !== void 0 ? rawTextEndRegex : textEndRegex;
                    // We may be ending an unquoted attribute value, so make sure we
                    // clear any pending attrNameEndIndex
                    attrNameEndIndex = -1;
                }
                else if (match[ATTRIBUTE_NAME] === undefined) {
                    // Attribute name position
                    attrNameEndIndex = -2;
                }
                else {
                    attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS].length;
                    attrName = match[ATTRIBUTE_NAME];
                    regex =
                        match[QUOTE_CHAR] === undefined
                            ? tagEndRegex
                            : match[QUOTE_CHAR] === '"'
                                ? doubleQuoteAttrEndRegex
                                : singleQuoteAttrEndRegex;
                }
            }
            else if (regex === doubleQuoteAttrEndRegex ||
                regex === singleQuoteAttrEndRegex) {
                regex = tagEndRegex;
            }
            else if (regex === commentEndRegex || regex === comment2EndRegex) {
                regex = textEndRegex;
            }
            else {
                // Not one of the five state regexes, so it must be the dynamically
                // created raw text regex and we're at the close of that element.
                regex = tagEndRegex;
                rawTextEndRegex = undefined;
            }
        }
        if (DEV_MODE) {
            // If we have a attrNameEndIndex, which indicates that we should
            // rewrite the attribute name, assert that we're in a valid attribute
            // position - either in a tag, or a quoted attribute value.
            console.assert(attrNameEndIndex === -1 ||
                regex === tagEndRegex ||
                regex === singleQuoteAttrEndRegex ||
                regex === doubleQuoteAttrEndRegex, 'unexpected parse state B');
        }
        // We have four cases:
        //  1. We're in text position, and not in a raw text element
        //     (regex === textEndRegex): insert a comment marker.
        //  2. We have a non-negative attrNameEndIndex which means we need to
        //     rewrite the attribute name to add a bound attribute suffix.
        //  3. We're at the non-first binding in a multi-binding attribute, use a
        //     plain marker.
        //  4. We're somewhere else inside the tag. If we're in attribute name
        //     position (attrNameEndIndex === -2), add a sequential suffix to
        //     generate a unique attribute name.
        // Detect a binding next to self-closing tag end and insert a space to
        // separate the marker from the tag end:
        const end = regex === tagEndRegex && strings[i + 1].startsWith('/>') ? ' ' : '';
        html +=
            regex === textEndRegex
                ? s + nodeMarker
                : attrNameEndIndex >= 0
                    ? (attrNames.push(attrName),
                        s.slice(0, attrNameEndIndex) +
                            boundAttributeSuffix +
                            s.slice(attrNameEndIndex)) +
                        marker +
                        end
                    : s +
                        marker +
                        (attrNameEndIndex === -2 ? (attrNames.push(undefined), i) : end);
    }
    const htmlResult = html + (strings[l] || '<?>') + (type === SVG_RESULT ? '</svg>' : '');
    // A security check to prevent spoofing of Lit template results.
    // In the future, we may be able to replace this with Array.isTemplateObject,
    // though we might need to make that check inside of the html and svg
    // functions, because precompiled templates don't come in as
    // TemplateStringArray objects.
    if (!Array.isArray(strings) || !strings.hasOwnProperty('raw')) {
        let message = 'invalid template strings array';
        if (DEV_MODE) {
            message =
                `Internal Error: expected template strings to be an array ` +
                    `with a 'raw' field. Please file a bug at ` +
                    `https://github.com/lit/lit/issues/new?template=bug_report.md ` +
                    `and include information about your build tooling, if any.`;
        }
        throw new Error(message);
    }
    // Returned as an array for terseness
    return [
        policy !== undefined
            ? policy.createHTML(htmlResult)
            : htmlResult,
        attrNames,
    ];
};
class Template {
    constructor(
    // This property needs to remain unminified.
    { strings, ['_$litType$']: type }, options) {
        /** @internal */
        this.parts = [];
        let node;
        let nodeIndex = 0;
        let attrNameIndex = 0;
        const partCount = strings.length - 1;
        const parts = this.parts;
        // Create template element
        const [html, attrNames] = getTemplateHtml(strings, type);
        this.el = Template.createElement(html, options);
        walker.currentNode = this.el.content;
        // Reparent SVG nodes into template root
        if (type === SVG_RESULT) {
            const content = this.el.content;
            const svgElement = content.firstChild;
            svgElement.remove();
            content.append(...svgElement.childNodes);
        }
        // Walk the template to find binding markers and create TemplateParts
        while ((node = walker.nextNode()) !== null && parts.length < partCount) {
            if (node.nodeType === 1) {
                if (DEV_MODE) {
                    const tag = node.localName;
                    // Warn if `textarea` includes an expression and throw if `template`
                    // does since these are not supported. We do this by checking
                    // innerHTML for anything that looks like a marker. This catches
                    // cases like bindings in textarea there markers turn into text nodes.
                    if (/^(?:textarea|template)$/i.test(tag) &&
                        node.innerHTML.includes(marker)) {
                        const m = `Expressions are not supported inside \`${tag}\` ` +
                            `elements. See https://lit.dev/msg/expression-in-${tag} for more ` +
                            `information.`;
                        if (tag === 'template') {
                            throw new Error(m);
                        }
                        else
                            issueWarning('', m);
                    }
                }
                // TODO (justinfagnani): for attempted dynamic tag names, we don't
                // increment the bindingIndex, and it'll be off by 1 in the element
                // and off by two after it.
                if (node.hasAttributes()) {
                    // We defer removing bound attributes because on IE we might not be
                    // iterating attributes in their template order, and would sometimes
                    // remove an attribute that we still need to create a part for.
                    const attrsToRemove = [];
                    for (const name of node.getAttributeNames()) {
                        // `name` is the name of the attribute we're iterating over, but not
                        // _neccessarily_ the name of the attribute we will create a part
                        // for. They can be different in browsers that don't iterate on
                        // attributes in source order. In that case the attrNames array
                        // contains the attribute name we'll process next. We only need the
                        // attribute name here to know if we should process a bound attribute
                        // on this element.
                        if (name.endsWith(boundAttributeSuffix) ||
                            name.startsWith(marker)) {
                            const realName = attrNames[attrNameIndex++];
                            attrsToRemove.push(name);
                            if (realName !== undefined) {
                                // Lowercase for case-sensitive SVG attributes like viewBox
                                const value = node.getAttribute(realName.toLowerCase() + boundAttributeSuffix);
                                const statics = value.split(marker);
                                const m = /([.?@])?(.*)/.exec(realName);
                                parts.push({
                                    type: ATTRIBUTE_PART,
                                    index: nodeIndex,
                                    name: m[2],
                                    strings: statics,
                                    ctor: m[1] === '.'
                                        ? PropertyPart
                                        : m[1] === '?'
                                            ? BooleanAttributePart
                                            : m[1] === '@'
                                                ? EventPart
                                                : AttributePart,
                                });
                            }
                            else {
                                parts.push({
                                    type: ELEMENT_PART,
                                    index: nodeIndex,
                                });
                            }
                        }
                    }
                    for (const name of attrsToRemove) {
                        node.removeAttribute(name);
                    }
                }
                // TODO (justinfagnani): benchmark the regex against testing for each
                // of the 3 raw text element names.
                if (rawTextElement.test(node.tagName)) {
                    // For raw text elements we need to split the text content on
                    // markers, create a Text node for each segment, and create
                    // a TemplatePart for each marker.
                    const strings = node.textContent.split(marker);
                    const lastIndex = strings.length - 1;
                    if (lastIndex > 0) {
                        node.textContent = trustedTypes
                            ? trustedTypes.emptyScript
                            : '';
                        // Generate a new text node for each literal section
                        // These nodes are also used as the markers for node parts
                        // We can't use empty text nodes as markers because they're
                        // normalized when cloning in IE (could simplify when
                        // IE is no longer supported)
                        for (let i = 0; i < lastIndex; i++) {
                            node.append(strings[i], createMarker());
                            // Walk past the marker node we just added
                            walker.nextNode();
                            parts.push({ type: CHILD_PART, index: ++nodeIndex });
                        }
                        // Note because this marker is added after the walker's current
                        // node, it will be walked to in the outer loop (and ignored), so
                        // we don't need to adjust nodeIndex here
                        node.append(strings[lastIndex], createMarker());
                    }
                }
            }
            else if (node.nodeType === 8) {
                const data = node.data;
                if (data === markerMatch) {
                    parts.push({ type: CHILD_PART, index: nodeIndex });
                }
                else {
                    let i = -1;
                    while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                        // Comment node has a binding marker inside, make an inactive part
                        // The binding won't work, but subsequent bindings will
                        parts.push({ type: COMMENT_PART, index: nodeIndex });
                        // Move to the end of the match
                        i += marker.length - 1;
                    }
                }
            }
            nodeIndex++;
        }
    }
    // Overridden via `litHtmlPolyfillSupport` to provide platform support.
    /** @nocollapse */
    static createElement(html, _options) {
        const el = d.createElement('template');
        el.innerHTML = html;
        return el;
    }
}
function resolveDirective(part, value, parent = part, attributeIndex) {
    var _a, _b, _c;
    var _d;
    // Bail early if the value is explicitly noChange. Note, this means any
    // nested directive is still attached and is not run.
    if (value === noChange) {
        return value;
    }
    let currentDirective = attributeIndex !== undefined
        ? (_a = parent.__directives) === null || _a === void 0 ? void 0 : _a[attributeIndex]
        : parent.__directive;
    const nextDirectiveConstructor = isPrimitive(value)
        ? undefined
        : // This property needs to remain unminified.
            value['_$litDirective$'];
    if ((currentDirective === null || currentDirective === void 0 ? void 0 : currentDirective.constructor) !== nextDirectiveConstructor) {
        // This property needs to remain unminified.
        (_b = currentDirective === null || currentDirective === void 0 ? void 0 : currentDirective['_$notifyDirectiveConnectionChanged']) === null || _b === void 0 ? void 0 : _b.call(currentDirective, false);
        if (nextDirectiveConstructor === undefined) {
            currentDirective = undefined;
        }
        else {
            currentDirective = new nextDirectiveConstructor(part);
            currentDirective._$initialize(part, parent, attributeIndex);
        }
        if (attributeIndex !== undefined) {
            ((_c = (_d = parent).__directives) !== null && _c !== void 0 ? _c : (_d.__directives = []))[attributeIndex] =
                currentDirective;
        }
        else {
            parent.__directive = currentDirective;
        }
    }
    if (currentDirective !== undefined) {
        value = resolveDirective(part, currentDirective._$resolve(part, value.values), currentDirective, attributeIndex);
    }
    return value;
}
/**
 * An updateable instance of a Template. Holds references to the Parts used to
 * update the template instance.
 */
class TemplateInstance {
    constructor(template, parent) {
        /** @internal */
        this._parts = [];
        /** @internal */
        this._$disconnectableChildren = undefined;
        this._$template = template;
        this._$parent = parent;
    }
    // Called by ChildPart parentNode getter
    get parentNode() {
        return this._$parent.parentNode;
    }
    // See comment in Disconnectable interface for why this is a getter
    get _$isConnected() {
        return this._$parent._$isConnected;
    }
    // This method is separate from the constructor because we need to return a
    // DocumentFragment and we don't want to hold onto it with an instance field.
    _clone(options) {
        var _a;
        const { el: { content }, parts: parts, } = this._$template;
        const fragment = ((_a = options === null || options === void 0 ? void 0 : options.creationScope) !== null && _a !== void 0 ? _a : d).importNode(content, true);
        walker.currentNode = fragment;
        let node = walker.nextNode();
        let nodeIndex = 0;
        let partIndex = 0;
        let templatePart = parts[0];
        while (templatePart !== undefined) {
            if (nodeIndex === templatePart.index) {
                let part;
                if (templatePart.type === CHILD_PART) {
                    part = new ChildPart(node, node.nextSibling, this, options);
                }
                else if (templatePart.type === ATTRIBUTE_PART) {
                    part = new templatePart.ctor(node, templatePart.name, templatePart.strings, this, options);
                }
                else if (templatePart.type === ELEMENT_PART) {
                    part = new ElementPart(node, this, options);
                }
                this._parts.push(part);
                templatePart = parts[++partIndex];
            }
            if (nodeIndex !== (templatePart === null || templatePart === void 0 ? void 0 : templatePart.index)) {
                node = walker.nextNode();
                nodeIndex++;
            }
        }
        return fragment;
    }
    _update(values) {
        let i = 0;
        for (const part of this._parts) {
            if (part !== undefined) {
                if (part.strings !== undefined) {
                    part._$setValue(values, part, i);
                    // The number of values the part consumes is part.strings.length - 1
                    // since values are in between template spans. We increment i by 1
                    // later in the loop, so increment it by part.strings.length - 2 here
                    i += part.strings.length - 2;
                }
                else {
                    part._$setValue(values[i]);
                }
            }
            i++;
        }
    }
}
class ChildPart {
    constructor(startNode, endNode, parent, options) {
        var _a;
        this.type = CHILD_PART;
        this._$committedValue = nothing;
        // The following fields will be patched onto ChildParts when required by
        // AsyncDirective
        /** @internal */
        this._$disconnectableChildren = undefined;
        this._$startNode = startNode;
        this._$endNode = endNode;
        this._$parent = parent;
        this.options = options;
        // Note __isConnected is only ever accessed on RootParts (i.e. when there is
        // no _$parent); the value on a non-root-part is "don't care", but checking
        // for parent would be more code
        this.__isConnected = (_a = options === null || options === void 0 ? void 0 : options.isConnected) !== null && _a !== void 0 ? _a : true;
        if (ENABLE_EXTRA_SECURITY_HOOKS) {
            // Explicitly initialize for consistent class shape.
            this._textSanitizer = undefined;
        }
    }
    // See comment in Disconnectable interface for why this is a getter
    get _$isConnected() {
        var _a, _b;
        // ChildParts that are not at the root should always be created with a
        // parent; only RootChildNode's won't, so they return the local isConnected
        // state
        return (_b = (_a = this._$parent) === null || _a === void 0 ? void 0 : _a._$isConnected) !== null && _b !== void 0 ? _b : this.__isConnected;
    }
    /**
     * The parent node into which the part renders its content.
     *
     * A ChildPart's content consists of a range of adjacent child nodes of
     * `.parentNode`, possibly bordered by 'marker nodes' (`.startNode` and
     * `.endNode`).
     *
     * - If both `.startNode` and `.endNode` are non-null, then the part's content
     * consists of all siblings between `.startNode` and `.endNode`, exclusively.
     *
     * - If `.startNode` is non-null but `.endNode` is null, then the part's
     * content consists of all siblings following `.startNode`, up to and
     * including the last child of `.parentNode`. If `.endNode` is non-null, then
     * `.startNode` will always be non-null.
     *
     * - If both `.endNode` and `.startNode` are null, then the part's content
     * consists of all child nodes of `.parentNode`.
     */
    get parentNode() {
        let parentNode = wrap(this._$startNode).parentNode;
        const parent = this._$parent;
        if (parent !== undefined &&
            parentNode.nodeType === 11 /* Node.DOCUMENT_FRAGMENT */) {
            // If the parentNode is a DocumentFragment, it may be because the DOM is
            // still in the cloned fragment during initial render; if so, get the real
            // parentNode the part will be committed into by asking the parent.
            parentNode = parent.parentNode;
        }
        return parentNode;
    }
    /**
     * The part's leading marker node, if any. See `.parentNode` for more
     * information.
     */
    get startNode() {
        return this._$startNode;
    }
    /**
     * The part's trailing marker node, if any. See `.parentNode` for more
     * information.
     */
    get endNode() {
        return this._$endNode;
    }
    _$setValue(value, directiveParent = this) {
        if (DEV_MODE && this.parentNode === null) {
            throw new Error(`This \`ChildPart\` has no \`parentNode\` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's \`innerHTML\` or \`textContent\` can do this.`);
        }
        value = resolveDirective(this, value, directiveParent);
        if (isPrimitive(value)) {
            // Non-rendering child values. It's important that these do not render
            // empty text nodes to avoid issues with preventing default <slot>
            // fallback content.
            if (value === nothing || value == null || value === '') {
                if (this._$committedValue !== nothing) {
                    this._$clear();
                }
                this._$committedValue = nothing;
            }
            else if (value !== this._$committedValue && value !== noChange) {
                this._commitText(value);
            }
            // This property needs to remain unminified.
        }
        else if (value['_$litType$'] !== undefined) {
            this._commitTemplateResult(value);
        }
        else if (value.nodeType !== undefined) {
            this._commitNode(value);
        }
        else if (isIterable(value)) {
            this._commitIterable(value);
        }
        else {
            // Fallback, will render the string representation
            this._commitText(value);
        }
    }
    _insert(node, ref = this._$endNode) {
        return wrap(wrap(this._$startNode).parentNode).insertBefore(node, ref);
    }
    _commitNode(value) {
        var _a;
        if (this._$committedValue !== value) {
            this._$clear();
            if (ENABLE_EXTRA_SECURITY_HOOKS &&
                sanitizerFactoryInternal !== noopSanitizer) {
                const parentNodeName = (_a = this._$startNode.parentNode) === null || _a === void 0 ? void 0 : _a.nodeName;
                if (parentNodeName === 'STYLE' || parentNodeName === 'SCRIPT') {
                    let message = 'Forbidden';
                    if (DEV_MODE) {
                        if (parentNodeName === 'STYLE') {
                            message =
                                `Lit does not support binding inside style nodes. ` +
                                    `This is a security risk, as style injection attacks can ` +
                                    `exfiltrate data and spoof UIs. ` +
                                    `Consider instead using css\`...\` literals ` +
                                    `to compose styles, and make do dynamic styling with ` +
                                    `css custom properties, ::parts, <slot>s, ` +
                                    `and by mutating the DOM rather than stylesheets.`;
                        }
                        else {
                            message =
                                `Lit does not support binding inside script nodes. ` +
                                    `This is a security risk, as it could allow arbitrary ` +
                                    `code execution.`;
                        }
                    }
                    throw new Error(message);
                }
            }
            this._$committedValue = this._insert(value);
        }
    }
    _commitText(value) {
        // If the committed value is a primitive it means we called _commitText on
        // the previous render, and we know that this._$startNode.nextSibling is a
        // Text node. We can now just replace the text content (.data) of the node.
        if (this._$committedValue !== nothing &&
            isPrimitive(this._$committedValue)) {
            const node = wrap(this._$startNode).nextSibling;
            if (ENABLE_EXTRA_SECURITY_HOOKS) {
                if (this._textSanitizer === undefined) {
                    this._textSanitizer = createSanitizer(node, 'data', 'property');
                }
                value = this._textSanitizer(value);
            }
            node.data = value;
        }
        else {
            if (ENABLE_EXTRA_SECURITY_HOOKS) {
                const textNode = document.createTextNode('');
                this._commitNode(textNode);
                // When setting text content, for security purposes it matters a lot
                // what the parent is. For example, <style> and <script> need to be
                // handled with care, while <span> does not. So first we need to put a
                // text node into the document, then we can sanitize its contentx.
                if (this._textSanitizer === undefined) {
                    this._textSanitizer = createSanitizer(textNode, 'data', 'property');
                }
                value = this._textSanitizer(value);
                textNode.data = value;
            }
            else {
                this._commitNode(d.createTextNode(value));
            }
        }
        this._$committedValue = value;
    }
    _commitTemplateResult(result) {
        var _a;
        // This property needs to remain unminified.
        const { values, ['_$litType$']: type } = result;
        // If $litType$ is a number, result is a plain TemplateResult and we get
        // the template from the template cache. If not, result is a
        // CompiledTemplateResult and _$litType$ is a CompiledTemplate and we need
        // to create the <template> element the first time we see it.
        const template = typeof type === 'number'
            ? this._$getTemplate(result)
            : (type.el === undefined &&
                (type.el = Template.createElement(type.h, this.options)),
                type);
        if (((_a = this._$committedValue) === null || _a === void 0 ? void 0 : _a._$template) === template) {
            this._$committedValue._update(values);
        }
        else {
            const instance = new TemplateInstance(template, this);
            const fragment = instance._clone(this.options);
            instance._update(values);
            this._commitNode(fragment);
            this._$committedValue = instance;
        }
    }
    // Overridden via `litHtmlPolyfillSupport` to provide platform support.
    /** @internal */
    _$getTemplate(result) {
        let template = templateCache.get(result.strings);
        if (template === undefined) {
            templateCache.set(result.strings, (template = new Template(result)));
        }
        return template;
    }
    _commitIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If value is an array, then the previous render was of an
        // iterable and value will contain the ChildParts from the previous
        // render. If value is not an array, clear this part and make a new
        // array for ChildParts.
        if (!isArray(this._$committedValue)) {
            this._$committedValue = [];
            this._$clear();
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this._$committedValue;
        let partIndex = 0;
        let itemPart;
        for (const item of value) {
            if (partIndex === itemParts.length) {
                // If no existing part, create a new one
                // TODO (justinfagnani): test perf impact of always creating two parts
                // instead of sharing parts between nodes
                // https://github.com/lit/lit/issues/1266
                itemParts.push((itemPart = new ChildPart(this._insert(createMarker()), this._insert(createMarker()), this, this.options)));
            }
            else {
                // Reuse an existing part
                itemPart = itemParts[partIndex];
            }
            itemPart._$setValue(item);
            partIndex++;
        }
        if (partIndex < itemParts.length) {
            // itemParts always have end nodes
            this._$clear(itemPart && wrap(itemPart._$endNode).nextSibling, partIndex);
            // Truncate the parts array so _value reflects the current state
            itemParts.length = partIndex;
        }
    }
    /**
     * Removes the nodes contained within this Part from the DOM.
     *
     * @param start Start node to clear from, for clearing a subset of the part's
     *     DOM (used when truncating iterables)
     * @param from  When `start` is specified, the index within the iterable from
     *     which ChildParts are being removed, used for disconnecting directives in
     *     those Parts.
     *
     * @internal
     */
    _$clear(start = wrap(this._$startNode).nextSibling, from) {
        var _a;
        (_a = this._$notifyConnectionChanged) === null || _a === void 0 ? void 0 : _a.call(this, false, true, from);
        while (start && start !== this._$endNode) {
            const n = wrap(start).nextSibling;
            wrap(start).remove();
            start = n;
        }
    }
    /**
     * Implementation of RootPart's `isConnected`. Note that this metod
     * should only be called on `RootPart`s (the `ChildPart` returned from a
     * top-level `render()` call). It has no effect on non-root ChildParts.
     * @param isConnected Whether to set
     * @internal
     */
    setConnected(isConnected) {
        var _a;
        if (this._$parent === undefined) {
            this.__isConnected = isConnected;
            (_a = this._$notifyConnectionChanged) === null || _a === void 0 ? void 0 : _a.call(this, isConnected);
        }
        else if (DEV_MODE) {
            throw new Error('part.setConnected() may only be called on a ' +
                'RootPart returned from render().');
        }
    }
}
class AttributePart {
    constructor(element, name, strings, parent, options) {
        this.type = ATTRIBUTE_PART;
        /** @internal */
        this._$committedValue = nothing;
        /** @internal */
        this._$disconnectableChildren = undefined;
        this.element = element;
        this.name = name;
        this._$parent = parent;
        this.options = options;
        if (strings.length > 2 || strings[0] !== '' || strings[1] !== '') {
            this._$committedValue = new Array(strings.length - 1).fill(new String());
            this.strings = strings;
        }
        else {
            this._$committedValue = nothing;
        }
        if (ENABLE_EXTRA_SECURITY_HOOKS) {
            this._sanitizer = undefined;
        }
    }
    get tagName() {
        return this.element.tagName;
    }
    // See comment in Disconnectable interface for why this is a getter
    get _$isConnected() {
        return this._$parent._$isConnected;
    }
    /**
     * Sets the value of this part by resolving the value from possibly multiple
     * values and static strings and committing it to the DOM.
     * If this part is single-valued, `this._strings` will be undefined, and the
     * method will be called with a single value argument. If this part is
     * multi-value, `this._strings` will be defined, and the method is called
     * with the value array of the part's owning TemplateInstance, and an offset
     * into the value array from which the values should be read.
     * This method is overloaded this way to eliminate short-lived array slices
     * of the template instance values, and allow a fast-path for single-valued
     * parts.
     *
     * @param value The part value, or an array of values for multi-valued parts
     * @param valueIndex the index to start reading values from. `undefined` for
     *   single-valued parts
     * @param noCommit causes the part to not commit its value to the DOM. Used
     *   in hydration to prime attribute parts with their first-rendered value,
     *   but not set the attribute, and in SSR to no-op the DOM operation and
     *   capture the value for serialization.
     *
     * @internal
     */
    _$setValue(value, directiveParent = this, valueIndex, noCommit) {
        const strings = this.strings;
        // Whether any of the values has changed, for dirty-checking
        let change = false;
        if (strings === undefined) {
            // Single-value binding case
            value = resolveDirective(this, value, directiveParent, 0);
            change =
                !isPrimitive(value) ||
                    (value !== this._$committedValue && value !== noChange);
            if (change) {
                this._$committedValue = value;
            }
        }
        else {
            // Interpolation case
            const values = value;
            value = strings[0];
            let i, v;
            for (i = 0; i < strings.length - 1; i++) {
                v = resolveDirective(this, values[valueIndex + i], directiveParent, i);
                if (v === noChange) {
                    // If the user-provided value is `noChange`, use the previous value
                    v = this._$committedValue[i];
                }
                change || (change = !isPrimitive(v) || v !== this._$committedValue[i]);
                if (v === nothing) {
                    value = nothing;
                }
                else if (value !== nothing) {
                    value += (v !== null && v !== void 0 ? v : '') + strings[i + 1];
                }
                // We always record each value, even if one is `nothing`, for future
                // change detection.
                this._$committedValue[i] = v;
            }
        }
        if (change && !noCommit) {
            this._commitValue(value);
        }
    }
    /** @internal */
    _commitValue(value) {
        if (value === nothing) {
            wrap(this.element).removeAttribute(this.name);
        }
        else {
            if (ENABLE_EXTRA_SECURITY_HOOKS) {
                if (this._sanitizer === undefined) {
                    this._sanitizer = sanitizerFactoryInternal(this.element, this.name, 'attribute');
                }
                value = this._sanitizer(value !== null && value !== void 0 ? value : '');
            }
            wrap(this.element).setAttribute(this.name, (value !== null && value !== void 0 ? value : ''));
        }
    }
}
class PropertyPart extends AttributePart {
    constructor() {
        super(...arguments);
        this.type = PROPERTY_PART;
    }
    /** @internal */
    _commitValue(value) {
        if (ENABLE_EXTRA_SECURITY_HOOKS) {
            if (this._sanitizer === undefined) {
                this._sanitizer = sanitizerFactoryInternal(this.element, this.name, 'property');
            }
            value = this._sanitizer(value);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.element[this.name] = value === nothing ? undefined : value;
    }
}
// Temporary workaround for https://crbug.com/993268
// Currently, any attribute starting with "on" is considered to be a
// TrustedScript source. Such boolean attributes must be set to the equivalent
// trusted emptyScript value.
const emptyStringForBooleanAttribute = trustedTypes
    ? trustedTypes.emptyScript
    : '';
class BooleanAttributePart extends AttributePart {
    constructor() {
        super(...arguments);
        this.type = BOOLEAN_ATTRIBUTE_PART;
    }
    /** @internal */
    _commitValue(value) {
        if (value && value !== nothing) {
            wrap(this.element).setAttribute(this.name, emptyStringForBooleanAttribute);
        }
        else {
            wrap(this.element).removeAttribute(this.name);
        }
    }
}
class EventPart extends AttributePart {
    constructor(element, name, strings, parent, options) {
        super(element, name, strings, parent, options);
        this.type = EVENT_PART;
        if (DEV_MODE && this.strings !== undefined) {
            throw new Error(`A \`<${element.localName}>\` has a \`@${name}=...\` listener with ` +
                'invalid content. Event listeners in templates must have exactly ' +
                'one expression and no surrounding text.');
        }
    }
    // EventPart does not use the base _$setValue/_resolveValue implementation
    // since the dirty checking is more complex
    /** @internal */
    _$setValue(newListener, directiveParent = this) {
        var _a;
        newListener =
            (_a = resolveDirective(this, newListener, directiveParent, 0)) !== null && _a !== void 0 ? _a : nothing;
        if (newListener === noChange) {
            return;
        }
        const oldListener = this._$committedValue;
        // If the new value is nothing or any options change we have to remove the
        // part as a listener.
        const shouldRemoveListener = (newListener === nothing && oldListener !== nothing) ||
            newListener.capture !==
                oldListener.capture ||
            newListener.once !==
                oldListener.once ||
            newListener.passive !==
                oldListener.passive;
        // If the new value is not nothing and we removed the listener, we have
        // to add the part as a listener.
        const shouldAddListener = newListener !== nothing &&
            (oldListener === nothing || shouldRemoveListener);
        if (shouldRemoveListener) {
            this.element.removeEventListener(this.name, this, oldListener);
        }
        if (shouldAddListener) {
            // Beware: IE11 and Chrome 41 don't like using the listener as the
            // options object. Figure out how to deal w/ this in IE11 - maybe
            // patch addEventListener?
            this.element.addEventListener(this.name, this, newListener);
        }
        this._$committedValue = newListener;
    }
    handleEvent(event) {
        var _a, _b;
        if (typeof this._$committedValue === 'function') {
            this._$committedValue.call((_b = (_a = this.options) === null || _a === void 0 ? void 0 : _a.host) !== null && _b !== void 0 ? _b : this.element, event);
        }
        else {
            this._$committedValue.handleEvent(event);
        }
    }
}
class ElementPart {
    constructor(element, parent, options) {
        this.element = element;
        this.type = ELEMENT_PART;
        /** @internal */
        this._$disconnectableChildren = undefined;
        this._$parent = parent;
        this.options = options;
    }
    // See comment in Disconnectable interface for why this is a getter
    get _$isConnected() {
        return this._$parent._$isConnected;
    }
    _$setValue(value) {
        resolveDirective(this, value);
    }
}
/**
 * END USERS SHOULD NOT RELY ON THIS OBJECT.
 *
 * Private exports for use by other Lit packages, not intended for use by
 * external users.
 *
 * We currently do not make a mangled rollup build of the lit-ssr code. In order
 * to keep a number of (otherwise private) top-level exports  mangled in the
 * client side code, we export a _$LH object containing those members (or
 * helper methods for accessing private fields of those members), and then
 * re-export them for use in lit-ssr. This keeps lit-ssr agnostic to whether the
 * client-side code is being used in `dev` mode or `prod` mode.
 *
 * This has a unique name, to disambiguate it from private exports in
 * lit-element, which re-exports all of lit-html.
 *
 * @private
 */
const _$LH = {
    // Used in lit-ssr
    _boundAttributeSuffix: boundAttributeSuffix,
    _marker: marker,
    _markerMatch: markerMatch,
    _HTML_RESULT: HTML_RESULT,
    _getTemplateHtml: getTemplateHtml,
    // Used in hydrate
    _TemplateInstance: TemplateInstance,
    _isIterable: isIterable,
    _resolveDirective: resolveDirective,
    // Used in tests and private-ssr-support
    _ChildPart: ChildPart,
    _AttributePart: AttributePart,
    _BooleanAttributePart: BooleanAttributePart,
    _EventPart: EventPart,
    _PropertyPart: PropertyPart,
    _ElementPart: ElementPart,
};
// Apply polyfills if available
const polyfillSupport = DEV_MODE
    ? window.litHtmlPolyfillSupportDevMode
    : window.litHtmlPolyfillSupport;
polyfillSupport === null || polyfillSupport === void 0 ? void 0 : polyfillSupport(Template, ChildPart);
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for lit-html usage.
((_d = globalThis.litHtmlVersions) !== null && _d !== void 0 ? _d : (globalThis.litHtmlVersions = [])).push('2.1.1');
if (DEV_MODE && globalThis.litHtmlVersions.length > 1) {
    issueWarning('multiple-versions', `Multiple versions of Lit loaded. ` +
        `Loading multiple versions is not recommended.`);
}
//# sourceMappingURL=lit-html.js.map

/***/ }),

/***/ "./node_modules/lit/decorators.js":
/*!****************************************!*\
  !*** ./node_modules/lit/decorators.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "customElement": () => (/* reexport safe */ _lit_reactive_element_decorators_custom_element_js__WEBPACK_IMPORTED_MODULE_0__.customElement),
/* harmony export */   "property": () => (/* reexport safe */ _lit_reactive_element_decorators_property_js__WEBPACK_IMPORTED_MODULE_1__.property),
/* harmony export */   "state": () => (/* reexport safe */ _lit_reactive_element_decorators_state_js__WEBPACK_IMPORTED_MODULE_2__.state),
/* harmony export */   "eventOptions": () => (/* reexport safe */ _lit_reactive_element_decorators_event_options_js__WEBPACK_IMPORTED_MODULE_3__.eventOptions),
/* harmony export */   "query": () => (/* reexport safe */ _lit_reactive_element_decorators_query_js__WEBPACK_IMPORTED_MODULE_4__.query),
/* harmony export */   "queryAll": () => (/* reexport safe */ _lit_reactive_element_decorators_query_all_js__WEBPACK_IMPORTED_MODULE_5__.queryAll),
/* harmony export */   "queryAsync": () => (/* reexport safe */ _lit_reactive_element_decorators_query_async_js__WEBPACK_IMPORTED_MODULE_6__.queryAsync),
/* harmony export */   "queryAssignedElements": () => (/* reexport safe */ _lit_reactive_element_decorators_query_assigned_elements_js__WEBPACK_IMPORTED_MODULE_7__.queryAssignedElements),
/* harmony export */   "queryAssignedNodes": () => (/* reexport safe */ _lit_reactive_element_decorators_query_assigned_nodes_js__WEBPACK_IMPORTED_MODULE_8__.queryAssignedNodes)
/* harmony export */ });
/* harmony import */ var _lit_reactive_element_decorators_custom_element_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @lit/reactive-element/decorators/custom-element.js */ "./node_modules/@lit/reactive-element/development/decorators/custom-element.js");
/* harmony import */ var _lit_reactive_element_decorators_property_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @lit/reactive-element/decorators/property.js */ "./node_modules/@lit/reactive-element/development/decorators/property.js");
/* harmony import */ var _lit_reactive_element_decorators_state_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @lit/reactive-element/decorators/state.js */ "./node_modules/@lit/reactive-element/development/decorators/state.js");
/* harmony import */ var _lit_reactive_element_decorators_event_options_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @lit/reactive-element/decorators/event-options.js */ "./node_modules/@lit/reactive-element/development/decorators/event-options.js");
/* harmony import */ var _lit_reactive_element_decorators_query_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @lit/reactive-element/decorators/query.js */ "./node_modules/@lit/reactive-element/development/decorators/query.js");
/* harmony import */ var _lit_reactive_element_decorators_query_all_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @lit/reactive-element/decorators/query-all.js */ "./node_modules/@lit/reactive-element/development/decorators/query-all.js");
/* harmony import */ var _lit_reactive_element_decorators_query_async_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @lit/reactive-element/decorators/query-async.js */ "./node_modules/@lit/reactive-element/development/decorators/query-async.js");
/* harmony import */ var _lit_reactive_element_decorators_query_assigned_elements_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @lit/reactive-element/decorators/query-assigned-elements.js */ "./node_modules/@lit/reactive-element/development/decorators/query-assigned-elements.js");
/* harmony import */ var _lit_reactive_element_decorators_query_assigned_nodes_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! @lit/reactive-element/decorators/query-assigned-nodes.js */ "./node_modules/@lit/reactive-element/development/decorators/query-assigned-nodes.js");

//# sourceMappingURL=decorators.js.map


/***/ }),

/***/ "./node_modules/lit/directives/style-map.js":
/*!**************************************************!*\
  !*** ./node_modules/lit/directives/style-map.js ***!
  \**************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "styleMap": () => (/* reexport safe */ lit_html_directives_style_map_js__WEBPACK_IMPORTED_MODULE_0__.styleMap)
/* harmony export */ });
/* harmony import */ var lit_html_directives_style_map_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit-html/directives/style-map.js */ "./node_modules/lit-html/development/directives/style-map.js");

//# sourceMappingURL=style-map.js.map


/***/ }),

/***/ "./node_modules/lit/index.js":
/*!***********************************!*\
  !*** ./node_modules/lit/index.js ***!
  \***********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "CSSResult": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.CSSResult),
/* harmony export */   "INTERNAL": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.INTERNAL),
/* harmony export */   "LitElement": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.LitElement),
/* harmony export */   "ReactiveElement": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.ReactiveElement),
/* harmony export */   "UpdatingElement": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.UpdatingElement),
/* harmony export */   "_$LE": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__._$LE),
/* harmony export */   "_$LH": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__._$LH),
/* harmony export */   "adoptStyles": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.adoptStyles),
/* harmony export */   "css": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.css),
/* harmony export */   "defaultConverter": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.defaultConverter),
/* harmony export */   "getCompatibleStyle": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.getCompatibleStyle),
/* harmony export */   "html": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.html),
/* harmony export */   "noChange": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.noChange),
/* harmony export */   "notEqual": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.notEqual),
/* harmony export */   "nothing": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.nothing),
/* harmony export */   "render": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.render),
/* harmony export */   "supportsAdoptingStyleSheets": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.supportsAdoptingStyleSheets),
/* harmony export */   "svg": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.svg),
/* harmony export */   "unsafeCSS": () => (/* reexport safe */ lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__.unsafeCSS)
/* harmony export */ });
/* harmony import */ var _lit_reactive_element__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @lit/reactive-element */ "./node_modules/@lit/reactive-element/development/reactive-element.js");
/* harmony import */ var lit_html__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit-html */ "./node_modules/lit-html/development/lit-html.js");
/* harmony import */ var lit_element_lit_element_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lit-element/lit-element.js */ "./node_modules/lit-element/development/lit-element.js");

//# sourceMappingURL=index.js.map


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
                { name: "grid", path: "./dist/media/uv-grid.jpg" },
                { name: "crate", path: "./dist/media/crate-wooden.jpg" },
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


/***/ }),

/***/ "./src/ts/ui/application/Application.ts":
/*!**********************************************!*\
  !*** ./src/ts/ui/application/Application.ts ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var lit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit */ "./node_modules/lit/index.js");

const Application = () => lit__WEBPACK_IMPORTED_MODULE_0__.html `
  <x-modal open id="main-menu" hideConfirmButtons>
    <x-typography variant="h4" align="center">Rewild!</x-typography>
    <x-typography variant="body2"
      >Welcome to rewild. A game about exploration, natural history and saving the planet</x-typography
    >
    <x-button id="start-game" variant="contained" color="primary">Start Game</x-button>
  </x-modal>
`;
document.addEventListener("readystatechange", (e) => {
    if (document.readyState === "interactive" || document.readyState === "complete") {
        (0,lit__WEBPACK_IMPORTED_MODULE_0__.render)(Application(), document.querySelector("#lit"));
        const mainMenu = document.querySelector("#main-menu");
        mainMenu.addEventListener("close", (e) => (mainMenu.open = false));
        document.querySelector("#start-game").addEventListener("click", (e) => (mainMenu.open = false));
    }
});


/***/ }),

/***/ "./src/ts/ui/common/Button.ts":
/*!************************************!*\
  !*** ./src/ts/ui/common/Button.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Button": () => (/* binding */ Button)
/* harmony export */ });
/* harmony import */ var lit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit */ "./node_modules/lit/index.js");
/* harmony import */ var lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit/decorators.js */ "./node_modules/lit/decorators.js");
var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};


let Button = class Button extends lit__WEBPACK_IMPORTED_MODULE_0__.LitElement {
    constructor() {
        super();
        // Declare reactive properties
        this.disabled = false;
        this.color = "primary";
        this.variant = "contained";
        this.addEventListener("click", this.onClick.bind(this));
    }
    onClick(e) {
        if (this.disabled) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }
    // Render the UI as a function of component state
    render() {
        return lit__WEBPACK_IMPORTED_MODULE_0__.html `<button ?disabled=${this.disabled} class="${this.color} ${this.variant}">
      <slot></slot>
    </button>`;
    }
};
Button.styles = lit__WEBPACK_IMPORTED_MODULE_0__.css `
    button {
      padding: 0.5rem 1rem;
      border-radius: 5px;
      border: none;
      text-transform: uppercase;
      font-weight: 500;
      font-family: var(--font-family);
      font-weight: 400;
      cursor: pointer;
      user-select: none;
      transition: box-shadow 0.25s, background-color 0.25s;
    }

    button[disabled],
    button[disabled]:hover {
      opacity: 0.65;
      pointer-events: none;
    }

    button.contained {
      box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
    }

    button.contained:hover {
      box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
    }

    button.contained.primary {
      background: var(--primary-400);
      color: var(--on-primary-400);
    }
    button.contained.primary:hover {
      background: var(--primary-500);
      color: var(--on-primary-500);
    }
    button.contained.primary:active {
      background: var(--primary-600);
      color: var(--on-primary-600);
    }

    button.contained.secondary {
      background: var(--secondary-400);
      color: var(--on-secondary-400);
    }
    button.contained.secondary:hover {
      background: var(--secondary-500);
      color: var(--on-secondary-500);
    }
    button.contained.secondary:active {
      background: var(--secondary-600);
      color: var(--on-secondary-600);
    }

    button.contained.error {
      background: var(--error-400);
      color: var(--on-errory-400);
    }
    button.contained.error:hover {
      background: var(--error-500);
      color: var(--on-error-500);
    }
    button.contained.error:active {
      background: var(--error-600);
      color: var(--on-error-600);
    }

    button.outlined {
      background: transparent;
    }
    button.outlined:hover {
      background: rgba(0, 0, 0, 0.05);
    }
    button.outlined:active {
      background: rgba(0, 0, 0, 0.1);
    }

    button.outlined.primary {
      color: var(--primary-400);
      border: 1px solid var(--primary-400);
    }
    button.outlined.secondary {
      color: var(--secondary-400);
      border: 1px solid var(--secondary-400);
    }
    button.outlined.error {
      color: var(--errory-400);
      border: 1px solid var(--errory-400);
    }
  `;
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)({ type: Boolean }),
    __metadata("design:type", Boolean)
], Button.prototype, "disabled", void 0);
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)(),
    __metadata("design:type", String)
], Button.prototype, "color", void 0);
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)(),
    __metadata("design:type", String)
], Button.prototype, "variant", void 0);
Button = __decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.customElement)("x-button"),
    __metadata("design:paramtypes", [])
], Button);



/***/ }),

/***/ "./src/ts/ui/common/Modal.ts":
/*!***********************************!*\
  !*** ./src/ts/ui/common/Modal.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Modal": () => (/* binding */ Modal)
/* harmony export */ });
/* harmony import */ var lit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit */ "./node_modules/lit/index.js");
/* harmony import */ var lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit/decorators.js */ "./node_modules/lit/decorators.js");
var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};


let Modal = class Modal extends lit__WEBPACK_IMPORTED_MODULE_0__.LitElement {
    constructor() {
        super();
        // Declare reactive properties
        this.open = false;
        this.hideConfirmButtons = false;
    }
    onClick(e) {
        if (e.target.classList.contains("wrapper")) {
            this.dispatchEvent(new CustomEvent("close"));
        }
    }
    // Render the UI as a function of component state
    render() {
        const wrapperClass = this.open ? "wrapper visible" : "wrapper";
        return lit__WEBPACK_IMPORTED_MODULE_0__.html `
      <div class="${wrapperClass}" @click="${this.onClick}">
        <div class="modal">
          <span class="title">${this.title}</span>
          <div class="content">
            <slot></slot>
          </div>
          ${this.hideConfirmButtons
            ? null
            : lit__WEBPACK_IMPORTED_MODULE_0__.html `<div class="button-container">
                <x-button variant="outlined" @click="${this.onCancel}" class="cancel">Cancel</x-button>
                <x-button @click="${this.onOk}" class="ok">Okay</x-button>
              </div>`}
        </div>
      </div>
    `;
    }
    onCancel(e) {
        this.dispatchEvent(new CustomEvent("cancel"));
        this.removeAttribute("open");
    }
    onOk(e) {
        this.dispatchEvent(new CustomEvent("ok"));
        this.removeAttribute("open");
    }
};
Modal.styles = lit__WEBPACK_IMPORTED_MODULE_0__.css `
    .wrapper {
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
    }
    .visible {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
      transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;
    }
    .modal {
      padding: 1rem;
      background-color: var(--surface);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 2px;
      min-width: 300px;
    }
    .title {
      font-size: 18px;
    }
    .button-container {
      text-align: right;
    }
    .button-container > x-button {
      margin: 0 0 0 4px;
    }
    .content {
      padding: 0.5rem 0;
    }
  `;
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)({ type: Boolean }),
    __metadata("design:type", Boolean)
], Modal.prototype, "open", void 0);
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)({ type: Boolean }),
    __metadata("design:type", Boolean)
], Modal.prototype, "hideConfirmButtons", void 0);
Modal = __decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.customElement)("x-modal"),
    __metadata("design:paramtypes", [])
], Modal);



/***/ }),

/***/ "./src/ts/ui/common/Pane3D.ts":
/*!************************************!*\
  !*** ./src/ts/ui/common/Pane3D.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Pane3D": () => (/* binding */ Pane3D)
/* harmony export */ });
/* harmony import */ var lit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit */ "./node_modules/lit/index.js");
/* harmony import */ var lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit/decorators.js */ "./node_modules/lit/decorators.js");
var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};


let Pane3D = class Pane3D extends lit__WEBPACK_IMPORTED_MODULE_0__.LitElement {
    constructor() {
        super();
    }
    render() {
        return lit__WEBPACK_IMPORTED_MODULE_0__.html `
      <div>
        <slot></slot>
      </div>
    `;
    }
};
Pane3D.stlyes = lit__WEBPACK_IMPORTED_MODULE_0__.css `
    :host,
    canvas {
      width: 100%;
      height: 100%;
    }
  `;
Pane3D = __decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.customElement)("x-pane3d"),
    __metadata("design:paramtypes", [])
], Pane3D);



/***/ }),

/***/ "./src/ts/ui/common/Typography.ts":
/*!****************************************!*\
  !*** ./src/ts/ui/common/Typography.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Typography": () => (/* binding */ Typography)
/* harmony export */ });
/* harmony import */ var lit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lit */ "./node_modules/lit/index.js");
/* harmony import */ var lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lit/decorators.js */ "./node_modules/lit/decorators.js");
/* harmony import */ var lit_directives_style_map_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lit/directives/style-map.js */ "./node_modules/lit/directives/style-map.js");
var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};



let Typography = class Typography extends lit__WEBPACK_IMPORTED_MODULE_0__.LitElement {
    constructor() {
        super();
        this.variant = "body1";
        this.align = "inherit";
    }
    render() {
        return lit__WEBPACK_IMPORTED_MODULE_0__.html `<div class="typography ${this.variant}" style=${(0,lit_directives_style_map_js__WEBPACK_IMPORTED_MODULE_2__.styleMap)({ textAlign: this.align })}>
      <slot></slot>
    </div>`;
    }
};
Typography.styles = lit__WEBPACK_IMPORTED_MODULE_0__.css `
    div {
      margin: 0;
      font-family: var(--font-family);
      margin-bottom: 0.35em;
    }

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
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)({ type: String }),
    __metadata("design:type", String)
], Typography.prototype, "variant", void 0);
__decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.property)({ type: String }),
    __metadata("design:type", String)
], Typography.prototype, "align", void 0);
Typography = __decorate([
    (0,lit_decorators_js__WEBPACK_IMPORTED_MODULE_1__.customElement)("x-typography"),
    __metadata("design:paramtypes", [])
], Typography);



/***/ }),

/***/ "./src/ts/ui/index.ts":
/*!****************************!*\
  !*** ./src/ts/ui/index.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _common_Button__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./common/Button */ "./src/ts/ui/common/Button.ts");
/* harmony import */ var _common_Modal__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./common/Modal */ "./src/ts/ui/common/Modal.ts");
/* harmony import */ var _common_Pane3D__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./common/Pane3D */ "./src/ts/ui/common/Pane3D.ts");
/* harmony import */ var _common_Typography__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./common/Typography */ "./src/ts/ui/common/Typography.ts");
/* harmony import */ var _application_Application__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./application/Application */ "./src/ts/ui/application/Application.ts");







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
/* harmony import */ var _ui_index__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./ui/index */ "./src/ts/ui/index.ts");
/* harmony import */ var _core_GameManager__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./core/GameManager */ "./src/ts/core/GameManager.ts");
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
const gameManager = new _core_GameManager__WEBPACK_IMPORTED_MODULE_4__.GameManager("canvas");
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
    });
}
init();

})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=index_bundle.js.map