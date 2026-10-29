/**
 * Web Worker entry point for off-main-thread BVH construction.
 *
 * Receives vertex/index data + options, builds the tree with the Rust builder
 * (BVHWasm), and sends back a serialised BVH tree that can be deserialised on
 * the main thread.
 */
import '../../renderers/terrain/worker/SetupWorkerUtils';
import wasmUrl from '../../../../rewild-wasm/pkg/rewild_wasm_bg.wasm';
import { BVHOptions, DEFAULT_BVH_OPTIONS } from '../BVHNode';
import { buildBVHWasm } from '../BVHWasm';
import { loadRewildWasm } from '../../wasm/RewildWasm';

export interface BVHWorkerRequest {
  type: 'build';
  id: i32;
  vertices: Float32Array;
  indices: Uint32Array | undefined;
  options: Partial<BVHOptions>;
}

const wasmReady = loadRewildWasm(wasmUrl);

self.onmessage = async (event: MessageEvent<BVHWorkerRequest>) => {
  const { type, id, vertices, indices, options } = event.data;

  if (type !== 'build') return;

  await wasmReady;
  const mergedOptions: BVHOptions = { ...DEFAULT_BVH_OPTIONS, ...options };
  const serialized = buildBVHWasm(vertices, indices, mergedOptions);

  self.postMessage(
    { type: 'complete', id, data: serialized },
    {
      transfer: [serialized.nodes.buffer, serialized.triIndices.buffer],
    }
  );
};
