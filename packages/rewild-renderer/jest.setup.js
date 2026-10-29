import { TextDecoder, TextEncoder } from 'node:util';

// The wasm-bindgen glue creates a TextDecoder when it loads; jsdom has none.
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
  globalThis.TextEncoder = TextEncoder;
}
