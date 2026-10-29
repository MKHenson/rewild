import { TextDecoder, TextEncoder } from 'node:util';

// The wasm-bindgen glue creates a TextDecoder when it loads; jsdom has none.
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
  globalThis.TextEncoder = TextEncoder;
}

// Terrain and BVH code calls Rust, so every spec gets the module. Required
// after the polyfill, which the glue needs as it loads.
require('./lib/wasm/RewildWasm').loadRewildWasmSync(
  require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../rewild-wasm/pkg/rewild_wasm_bg.wasm')
  )
);
