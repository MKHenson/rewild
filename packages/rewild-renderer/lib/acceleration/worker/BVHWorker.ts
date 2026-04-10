/**
 * Web Worker entry point for off-main-thread BVH construction.
 *
 * Receives vertex/index data + options, runs BVHBuilder, and sends back
 * a serialised BVH tree that can be deserialised on the main thread.
 */
import '../../renderers/terrain/worker/SetupWorkerUtils';
import { BVHBuilder } from '../BVHBuilder';
import { BVHOptions, DEFAULT_BVH_OPTIONS } from '../BVHNode';
import { serializeBVH } from '../BVHSerializer';

export interface BVHWorkerRequest {
  type: 'build';
  id: i32;
  vertices: Float32Array;
  indices: Uint32Array | undefined;
  options: Partial<BVHOptions>;
}

self.onmessage = (event: MessageEvent<BVHWorkerRequest>) => {
  const { type, id, vertices, indices, options } = event.data;

  if (type !== 'build') return;

  const mergedOptions: BVHOptions = { ...DEFAULT_BVH_OPTIONS, ...options };
  const builder = new BVHBuilder(vertices, indices, mergedOptions);
  const root = builder.build();
  const serialized = serializeBVH(root, builder.triIndices);

  self.postMessage(
    { type: 'complete', id, data: serialized },
    {
      transfer: [serialized.nodes.buffer, serialized.triIndices.buffer],
    }
  );
};
