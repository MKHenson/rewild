import { Geometry } from '../geometry/Geometry';
import { load } from '@loaders.gl/core';
import { GLTFLoader, postProcessGLTF } from '@loaders.gl/gltf';

export async function loadGLTF(url: string, geometry: Geometry): Promise<void> {
  const gltfData = await load(url, GLTFLoader);

  // Use postProcessGLTF to resolve buffers into typed arrays
  const processedGltf = postProcessGLTF(gltfData);

  // Example traversal (assuming a single mesh/primitive for simplicity):
  const mesh = processedGltf.meshes[0];
  if (mesh && mesh.primitives[0]) {
    const attributes = mesh.primitives[0].attributes;

    geometry.vertices = attributes.POSITION.value as Float32Array;
    geometry.normals = attributes.NORMAL?.value as Float32Array;
    geometry.uvs = attributes.TEXCOORD_0?.value as Float32Array;
    geometry.indices = new Uint32Array(
      mesh.primitives[0].indices?.value as Uint16Array | Uint32Array
    );

    // If normals were not provided, compute simple vertex normals
    if (!attributes.NORMAL) geometry.computeNormals();
  }

  // Compute bounds for culling/picking
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.requiresBuild = true;
}
