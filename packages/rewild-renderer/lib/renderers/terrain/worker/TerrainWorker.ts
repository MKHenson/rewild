import './SetupWorkerUtils';
import { generateTerrainMesh, MESH_STRIDE } from '../MeshGenerator';
import { generateNoiseMap } from '../Noise';
import { Vector2 } from 'rewild-common';

const NOISE_SCALE = 400;      // feature size in world-units (meters); large enough for mountains spanning multiple chunks
const NOISE_OCTAVES = 6;
const NOISE_PERSISTENCE = 0.5;
const NOISE_LACUNARITY = 2.0;
const HEIGHT_SCALE = 80;      // max terrain height in meters

self.onmessage = async (event: MessageEvent) => {
  const { chunkSize, lod, position } = event.data;

  const noise = generateNoiseMap(
    chunkSize,
    chunkSize,
    NOISE_SCALE,
    undefined,
    NOISE_OCTAVES,
    NOISE_PERSISTENCE,
    NOISE_LACUNARITY,
    new Vector2(position.x, position.y)
  );

  // Apply height curve: pushes mid-range values lower (more plains) while keeping
  // peaks tall (mountains). Pow > 1 squishes towards 0; 1.5 is a mild but noticeable bias.
  for (let i = 0; i < noise.length; i++) {
    noise[i] = Math.pow(noise[i], 1.5);
  }

  // Terrain colour bands based on normalised height [0, 1]
  const textureValues = new Uint8Array(chunkSize * chunkSize * 4);
  for (let i = 0; i < chunkSize * chunkSize; i++) {
    const h = noise[i];
    let r: number, g: number, b: number;

    if (h < 0.15) {
      // Wet lowlands — dark green/moss
      const t = h / 0.15;
      r = Math.round(40 + t * 30);
      g = Math.round(80 + t * 30);
      b = Math.round(40 + t * 10);
    } else if (h < 0.45) {
      // Grasslands
      const t = (h - 0.15) / 0.3;
      r = Math.round(70 + t * 30);
      g = Math.round(110 + t * 20);
      b = Math.round(50 + t * 10);
    } else if (h < 0.70) {
      // Upland / shrub — earthy greens transitioning to brown
      const t = (h - 0.45) / 0.25;
      r = Math.round(100 + t * 50);
      g = Math.round(130 - t * 30);
      b = Math.round(60 - t * 20);
    } else if (h < 0.88) {
      // Rocky slopes
      const t = (h - 0.70) / 0.18;
      r = Math.round(150 + t * 40);
      g = Math.round(100 + t * 30);
      b = Math.round(40 + t * 30);
    } else {
      // Mountain peaks — grey / snow
      const t = Math.min((h - 0.88) / 0.12, 1);
      r = Math.round(190 + t * 65);
      g = Math.round(130 + t * 110);
      b = Math.round(70 + t * 180);
    }

    textureValues[i * 4]     = r;
    textureValues[i * 4 + 1] = g;
    textureValues[i * 4 + 2] = b;
    textureValues[i * 4 + 3] = 255;
  }

  const meshData = generateTerrainMesh(noise, chunkSize, chunkSize, lod, HEIGHT_SCALE);

  const vertexCount = meshData.interleaved.length / MESH_STRIDE;
  const vertices = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i++) {
    const base = i * MESH_STRIDE;
    vertices[i * 3]     = meshData.interleaved[base];
    vertices[i * 3 + 1] = meshData.interleaved[base + 1];
    vertices[i * 3 + 2] = meshData.interleaved[base + 2];
    uvs[i * 2]     = meshData.interleaved[base + 3];
    uvs[i * 2 + 1] = meshData.interleaved[base + 4];
  }
  const normals = meshData.normals;
  const indices = meshData.triangles;

  self.postMessage(
    { texture: textureValues, vertices, uvs, normals, indices },
    {
      transfer: [
        textureValues.buffer,
        vertices.buffer,
        uvs.buffer,
        normals.buffer,
        indices.buffer,
      ],
    }
  );
};
