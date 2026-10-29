import './SetupWorkerUtils';
import wasmUrl from '../../../../../rewild-wasm/pkg/rewild_wasm_bg.wasm';
import { buildChunkMesh } from './buildChunkMesh';
import { waterMapTransferables } from '../WaterMap';
import { loadRewildWasm } from '../../../wasm/RewildWasm';

const wasmReady = loadRewildWasm(wasmUrl);

self.onmessage = async (event: MessageEvent) => {
  await wasmReady;
  const {
    splat,
    vertices,
    uvs,
    normals,
    indices,
    heights,
    scatter,
    water,
    ring,
  } = buildChunkMesh(event.data);

  // splat, water and ring are absent when the build skipped them. An absent
  // field must stay absent rather than become null: a null water map means dry.
  self.postMessage(
    { splat, vertices, uvs, normals, indices, heights, scatter, water, ring },
    {
      transfer: [
        ...(splat ? [splat.buffer] : []),
        vertices.buffer,
        uvs.buffer,
        normals.buffer,
        indices.buffer,
        heights.buffer,
        ...(ring ? [ring.buffer] : []),
        ...scatter.map((layer) => layer.data.buffer),
        ...waterMapTransferables(water ?? null),
      ],
    }
  );
};
