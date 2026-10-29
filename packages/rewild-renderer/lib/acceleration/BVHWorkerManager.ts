import { BVHNode, BVHOptions } from './BVHNode';
import { deserializeBVH, SerializedBVH } from './BVHSerializer';

interface PendingBuild {
  resolve: (result: { root: BVHNode; triIndices: Uint32Array }) => void;
  reject: (error: Error) => void;
}

/**
 * Manages a single BVH Web Worker and routes async build requests to it.
 *
 * Usage:
 * ```
 * const manager = new BVHWorkerManager();
 * const { root, triIndices } = await manager.buildAsync(vertices, indices, options);
 * manager.dispose();
 * ```
 */
export class BVHWorkerManager {
  private worker: Worker | null = null;
  private nextId: i32 = 0;
  private pending = new Map<i32, PendingBuild>();

  /** Lazily creates the worker on first use. */
  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker('/bvhWorker.js', { type: 'module' });
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
    }
    return this.worker;
  }

  /**
   * Build a BVH in the worker thread.
   *
   * Vertex and index data are copied (not transferred) so the caller
   * retains ownership of the original buffers.
   *
   * @returns The root BVHNode tree and reordered triIndices.
   */
  buildAsync(
    vertices: Float32Array,
    indices: Uint32Array | undefined,
    options: Partial<BVHOptions>
  ): Promise<{ root: BVHNode; triIndices: Uint32Array }> {
    const worker = this.ensureWorker();
    const id = this.nextId++;

    // Copy buffers so the geometry retains its data.
    const verticesCopy = new Float32Array(vertices);
    const indicesCopy = indices ? new Uint32Array(indices) : undefined;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const transferList: Transferable[] = [verticesCopy.buffer];
      if (indicesCopy) transferList.push(indicesCopy.buffer);

      worker.postMessage(
        {
          type: 'build',
          id,
          vertices: verticesCopy,
          indices: indicesCopy,
          options,
        },
        { transfer: transferList }
      );
    });
  }

  private handleMessage(
    event: MessageEvent<{
      type: string;
      id: i32;
      data: SerializedBVH;
    }>
  ): void {
    const { type, id, data } = event.data;
    if (type !== 'complete') return;

    const entry = this.pending.get(id);
    if (!entry) return;

    this.pending.delete(id);
    const root = deserializeBVH(data);
    entry.resolve({ root, triIndices: data.triIndices });
  }

  private handleError(event: ErrorEvent): void {
    // Reject all pending builds on worker error.
    for (const [, entry] of this.pending) {
      entry.reject(new Error(`BVH worker error: ${event.message}`));
    }
    this.pending.clear();
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, entry] of this.pending) {
      entry.reject(new Error('BVHWorkerManager disposed'));
    }
    this.pending.clear();
  }
}
