import './SetupWorkerUtils';
import { generateTerrainMesh } from '../MeshGenerator';
import { generateNoiseMap } from '../Noise';
import { Vector2 } from 'rewild-common';

self.onmessage = async (event: MessageEvent) => {
  const { chunkSize, lod, position } = event.data;

  const noise = generateNoiseMap(
    chunkSize,
    chunkSize,
    24,
    undefined,
    undefined,
    undefined,
    undefined,
    new Vector2(position.x, position.y)
  );

  // Convert this noise map of f32 to a u8 texture. Each pixel will be a shader of grey
  // (0-255) based on the noise value.
  const textureValues = new Uint8Array(chunkSize * chunkSize * 4);
  for (let i = 0; i < chunkSize * chunkSize; i++) {
    const value = Math.floor(Math.min(1, Math.max(0, noise[i])) * 255);
    textureValues[i * 4] = value;
    textureValues[i * 4 + 1] = value;
    textureValues[i * 4 + 2] = value;
    textureValues[i * 4 + 3] = 255; // alpha
  }

  const meshData = generateTerrainMesh(noise, chunkSize, chunkSize, lod);

  const vertices = new Float32Array(
    meshData.vertices.map((v) => v.toArray()).flat()
  );
  const uvs = new Float32Array(meshData.uvs.map((v) => v.toArray()).flat());
  const indices = new Uint16Array(meshData.triangles);

  // Send the generated mesh data back to the main thread
  self.postMessage(
    { texture: textureValues, vertices, uvs, indices },
    {
      transfer: [
        textureValues.buffer,
        vertices.buffer,
        uvs.buffer,
        indices.buffer,
      ],
    }
  );
};
