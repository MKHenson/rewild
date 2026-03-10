// JSDOM does not fully implement constructable stylesheets used by components.
// Provide a minimal polyfill so cssStylesheet(...) can run in unit tests.
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
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => ({ cssText: rule + '}' }));
    }
  }

  globalThis.CSSStyleSheet = CSSStyleSheetPolyfill;
} else if (
  typeof globalThis.CSSStyleSheet.prototype.replaceSync !== 'function'
) {
  globalThis.CSSStyleSheet.prototype.replaceSync = function replaceSync(text) {
    this._text = text;
    if (!Array.isArray(this.cssRules)) {
      this.cssRules = [];
    }
  };
}

if (!('adoptedStyleSheets' in Document.prototype)) {
  Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
    configurable: true,
    enumerable: true,
    get() {
      return this.__adoptedStyleSheets || [];
    },
    set(value) {
      this.__adoptedStyleSheets = Array.isArray(value) ? value : [];
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
    set(value) {
      this.__adoptedStyleSheets = Array.isArray(value) ? value : [];
    },
  });
}
