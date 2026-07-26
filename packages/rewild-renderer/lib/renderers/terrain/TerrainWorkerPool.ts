import type { PaintMask } from './PaintMask';

interface TerrainWorkerRequest {
  chunkSize: number;
  lod: number;
  position: { x: number; y: number };
  seed: number;
  climatePreset: string;
  // Snapshot heights for a saved chunk — the worker meshes these instead of
  // generating. Structured-cloned (not transferred): the chunk keeps its copy
  // for the other LOD requests.
  heights?: Float32Array;
  // Pre-assembled (chunkSize+2)² apron for an edited chunk — its heights plus a
  // ring of the real neighbour heights, so edge normals are two-sided and match
  // the neighbour. Supersedes `heights` (it carries them). See
  // TerrainRenderer.buildApron and BuildChunkMeshRequest.
  apron?: Float32Array;
  // The heights are an edit/snapshot rather than generator output, so the
  // worker's noise apron would not match them. See BuildChunkMeshRequest.
  edited?: boolean;
  // The chunk's painted biome mask. Structured-cloned (not transferred) — the
  // chunk keeps its copy for the other LOD requests and for the next stroke.
  biomeMask?: PaintMask;
}

export interface TerrainWorkerResponse {
  // RGBA8 splat map — per-texel weights over the climate's material palette
  // (see BuildChunkMeshResult).
  splat: Uint8Array;
  vertices: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  // Full LOD-0 heightfield the mesh was built from (see BuildChunkMeshResult).
  heights: Float32Array;
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
