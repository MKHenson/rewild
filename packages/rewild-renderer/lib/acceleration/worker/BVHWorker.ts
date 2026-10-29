/**
 * Web Worker entry point for off-main-thread BVH construction.
 *
 * Receives vertex/index data + options, builds the tree, and sends back
 * a serialised BVH tree that can be deserialised on the main thread.
 *
 * Builds with the Rust builder (BVHWasm) unless the request opts out or the
 * module failed to load. Then it builds with BVHBuilder. Both send the same
 * serialised layout.
 */
import '../../renderers/terrain/worker/SetupWorkerUtils';
import wasmUrl from '../../../../rewild-wasm/pkg/rewild_wasm_bg.wasm';
import { BVHBuilder } from '../BVHBuilder';
import { BVHOptions, DEFAULT_BVH_OPTIONS } from '../BVHNode';
import { SerializedBVH, serializeBVH } from '../BVHSerializer';
import { buildBVHWasm } from '../BVHWasm';
import { loadRewildWasm } from '../../wasm/RewildWasm';

export interface BVHWorkerRequest {
  type: 'build';
  id: i32;
  vertices: Float32Array;
  indices: Uint32Array | undefined;
  options: Partial<BVHOptions>;
  /** Build with the Rust builder. See BVHConfig.wasmWorkerBuilds. */
  wasm: boolean;
}

// Loads once per worker. A failed load leaves the JS builder in charge.
const wasmReady: Promise<boolean> = loadRewildWasm(wasmUrl).then(
  () => true,
  (err) => {
    console.warn('BVH worker: WASM failed to load, building in JS.', err);
    return false;
  }
);

function buildJs(
  vertices: Float32Array,
  indices: Uint32Array | undefined,
  options: BVHOptions
): SerializedBVH {
  const builder = new BVHBuilder(vertices, indices, options);
  const root = builder.build();
  return serializeBVH(root, builder.triIndices);
}

self.onmessage = async (event: MessageEvent<BVHWorkerRequest>) => {
  const { type, id, vertices, indices, options, wasm } = event.data;

  if (type !== 'build') return;

  const mergedOptions: BVHOptions = { ...DEFAULT_BVH_OPTIONS, ...options };
  const serialized =
    wasm && (await wasmReady)
      ? buildBVHWasm(vertices, indices, mergedOptions)
      : buildJs(vertices, indices, mergedOptions);

  self.postMessage(
    { type: 'complete', id, data: serialized },
    {
      transfer: [serialized.nodes.buffer, serialized.triIndices.buffer],
    }
  );
};
