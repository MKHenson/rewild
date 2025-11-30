import './SetupWorkerUtils';
import { generateTerrainMesh } from '../MeshGenerator';
import { generateNoiseMap } from '../Noise';
import { clamp, lerp, Vector2 } from 'rewild-common';

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
    const noiseValue = clamp(noise[i], 0, 1);
    textureValues[i * 4] = lerp(0.51 * 255, 255, noiseValue);
    textureValues[i * 4 + 1] = lerp(0.31 * 255, 255, noiseValue);
    textureValues[i * 4 + 2] = lerp(0.21 * 255, 255, noiseValue);
    textureValues[i * 4 + 3] = 255; // alpha
  }

  const meshData = generateTerrainMesh(noise, chunkSize, chunkSize, lod);

  const vertices = new Float32Array(
    meshData.vertices.map((v) => v.toArray()).flat()
  );
  const uvs = new Float32Array(meshData.uvs.map((v) => v.toArray()).flat());
  const indices = new Uint32Array(meshData.triangles);

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
