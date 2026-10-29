import 'fake-indexeddb/auto';
import { TextDecoder, TextEncoder } from 'node:util';

// The wasm-bindgen glue creates a TextDecoder when it loads; jsdom has none.
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
  globalThis.TextEncoder = TextEncoder;
}

// Terrain and BVH code calls Rust, so every spec gets the module. Required
// after the polyfill, which the glue needs as it loads.
require('./packages/rewild-renderer/lib/wasm/RewildWasm').loadRewildWasmSync(
  require('node:fs').readFileSync(
    require('node:path').join(
      __dirname,
      'packages/rewild-wasm/pkg/rewild_wasm_bg.wasm'
    )
  )
);

// CSSStyleSheet polyfill for UI component tests (jsdom lacks constructable stylesheet support)
if (typeof globalThis.CSSStyleSheet === 'undefined') {
  class CSSStyleSheetPolyfill {
    constructor() {
      this._text = '';
      this.cssRules = [];
    }
    replaceSync(text) {
      this._text = text;
      this.cssRules = text
        .split('}')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({ cssText: r + '}' }));
    }
  }
  globalThis.CSSStyleSheet = CSSStyleSheetPolyfill;
} else if (
  typeof globalThis.CSSStyleSheet.prototype.replaceSync !== 'function'
) {
  globalThis.CSSStyleSheet.prototype.replaceSync = function (text) {
    this._text = text;
  };
}

if (!('adoptedStyleSheets' in Document.prototype)) {
  Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
    configurable: true,
    enumerable: true,
    get() {
      return this.__adoptedStyleSheets || [];
    },
    set(v) {
      this.__adoptedStyleSheets = Array.isArray(v) ? v : [];
    },
  });
}

if (!('adoptedStyleSheets' in ShadowRoot.prototype)) {
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true,
    enumerable: true,
    get() {
      return this.__adoptedStyleSheets || [];
    },
    set(v) {
      this.__adoptedStyleSheets = Array.isArray(v) ? v : [];
    },
  });
}
