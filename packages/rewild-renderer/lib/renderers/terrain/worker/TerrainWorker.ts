import './SetupWorkerUtils';
import { buildChunkMesh } from './buildChunkMesh';

self.onmessage = async (event: MessageEvent) => {
  const { splat, vertices, uvs, normals, indices, heights } = buildChunkMesh(
    event.data
  );

  self.postMessage(
    { splat, vertices, uvs, normals, indices, heights },
    {
      transfer: [
        splat.buffer,
        vertices.buffer,
        uvs.buffer,
        normals.buffer,
        indices.buffer,
        heights.buffer,
      ],
    }
  );
};
