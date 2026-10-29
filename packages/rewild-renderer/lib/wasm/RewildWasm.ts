/**
 * Loads the rewild WASM module (packages/rewild-wasm). Load it once in each
 * worker, or each Node process, before calling any function that uses it.
 *
 * Build the module with `npm run build:wasm`. See docs/wasm.md.
 */
import init, { initSync } from '../../../rewild-wasm/pkg/rewild_wasm';

/** Fetches and compiles the module. For workers, with the URL esbuild emits. */
export async function loadRewildWasm(url: string): Promise<void> {
  await init({ module_or_path: url });
}

/** Compiles the module from its bytes. For Node: tests and benchmarks. */
export function loadRewildWasmSync(bytes: BufferSource): void {
  initSync({ module: bytes });
}
