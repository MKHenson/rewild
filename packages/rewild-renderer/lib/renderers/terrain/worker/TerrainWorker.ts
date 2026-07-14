import './SetupWorkerUtils';
import { buildChunkMesh } from './buildChunkMesh';

self.onmessage = async (event: MessageEvent) => {
  const { texture, vertices, uvs, normals, indices } = buildChunkMesh(
    event.data
  );

  self.postMessage(
    { texture, vertices, uvs, normals, indices },
    {
      transfer: [
        texture.buffer,
        vertices.buffer,
        uvs.buffer,
        normals.buffer,
        indices.buffer,
      ],
    }
  );
};
