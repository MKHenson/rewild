import './SetupWorkerUtils';
import { buildChunkMesh } from './buildChunkMesh';

self.onmessage = async (event: MessageEvent) => {
  const { splat, vertices, uvs, normals, indices, heights, scatter } =
    buildChunkMesh(event.data);

  self.postMessage(
    { splat, vertices, uvs, normals, indices, heights, scatter },
    {
      transfer: [
        splat.buffer,
        vertices.buffer,
        uvs.buffer,
        normals.buffer,
        indices.buffer,
        heights.buffer,
        ...scatter.map((layer) => layer.data.buffer),
      ],
    }
  );
};
