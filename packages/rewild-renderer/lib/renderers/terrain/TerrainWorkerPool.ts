interface TerrainWorkerRequest {
  chunkSize: number;
  lod: number;
  position: { x: number; y: number };
}

export interface TerrainWorkerResponse {
  texture: Uint8Array;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

interface QueuedRequest {
  request: TerrainWorkerRequest;
  resolve: (data: TerrainWorkerResponse) => void;
  reject: (err: Error) => void;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  pending: QueuedRequest | null;
}

export class TerrainWorkerPool {
  private workers: PooledWorker[];
  private queue: QueuedRequest[] = [];

  constructor(size: number = Math.min(navigator.hardwareConcurrency ?? 4, 4)) {
    this.workers = Array.from({ length: size }, () => {
      const worker = new Worker('/terrainWorker.js', { type: 'module' });
      const pooled: PooledWorker = { worker, busy: false, pending: null };
      worker.onmessage = (event) => this.handleMessage(pooled, event);
      worker.onerror = (event) => this.handleError(pooled, event);
      return pooled;
    });
  }

  enqueue(request: TerrainWorkerRequest): Promise<TerrainWorkerResponse> {
    return new Promise((resolve, reject) => {
      const queued: QueuedRequest = { request, resolve, reject };
      const idle = this.workers.find((w) => !w.busy);
      if (idle) {
        this.dispatch(idle, queued);
      } else {
        this.queue.push(queued);
      }
    });
  }

  private dispatch(pooled: PooledWorker, queued: QueuedRequest): void {
    pooled.busy = true;
    pooled.pending = queued;
    pooled.worker.postMessage({ type: 'start', ...queued.request });
  }

  private handleMessage(pooled: PooledWorker, event: MessageEvent): void {
    const pending = pooled.pending;
    pooled.busy = false;
    pooled.pending = null;

    pending?.resolve(event.data);

    const next = this.queue.shift();
    if (next) this.dispatch(pooled, next);
  }

  private handleError(pooled: PooledWorker, event: ErrorEvent): void {
    const pending = pooled.pending;
    pooled.busy = false;
    pooled.pending = null;

    pending?.reject(new Error(`Terrain worker error: ${event.message}`));

    const next = this.queue.shift();
    if (next) this.dispatch(pooled, next);
  }

  dispose(): void {
    for (const { worker, pending } of this.workers) {
      worker.terminate();
      pending?.reject(new Error('TerrainWorkerPool disposed'));
    }
    for (const queued of this.queue) {
      queued.reject(new Error('TerrainWorkerPool disposed'));
    }
    this.workers.length = 0;
    this.queue.length = 0;
  }
}
