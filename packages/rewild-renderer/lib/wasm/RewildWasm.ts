/**
 * Loads the rewild WASM module (packages/rewild-wasm). Load it once on the main
 * thread and in each worker, or each Node process, before calling any function
 * that uses it.
 *
 * Build the module with `npm run build:wasm`. See docs/wasm.md.
 */
import init, { initSync } from '../../../rewild-wasm/pkg/rewild_wasm';

/** A module whose one function returns `i8x16.popcnt(i8x16.splat(0))`. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

/** True when the runtime supports WebAssembly with 128-bit SIMD. */
export function hasWasmSimd(): boolean {
  return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
}

/** Fetches and compiles the module, with the URL esbuild emits. */
export async function loadRewildWasm(url: string): Promise<void> {
  await init({ module_or_path: url });
}

/** Compiles the module from its bytes. For Node: tests and benchmarks. */
export function loadRewildWasmSync(bytes: BufferSource): void {
  initSync({ module: bytes });
}
