import { Geometry } from '../geometry/Geometry';
import { load } from '@loaders.gl/core';
import { GLTFLoader, postProcessGLTF } from '@loaders.gl/gltf';

/**
 * glTF writes COLOR_0 as vec3 or vec4, in floats or normalized u8/u16 — six
 * combinations. Collapsing them to float RGBA here means the vertex buffer has
 * one layout and the shader has one path; a vec3 accessor gains alpha 1, which
 * is what the spec says it means.
 *
 * The component type is read off the array rather than the accessor's
 * `normalized` flag because glTF only permits the integer types *as*
 * normalized, so the array itself already says everything needed.
 */
function toFloatRgba(
  value: ArrayLike<number>,
  components: number
): Float32Array {
  const scale =
    value instanceof Uint8Array
      ? 1 / 255
      : value instanceof Uint16Array
        ? 1 / 65535
        : 1;

  const count = (value.length / components) | 0;
  const out = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const src = i * components;
    const dst = i * 4;
    out[dst] = value[src] * scale;
    out[dst + 1] = value[src + 1] * scale;
    out[dst + 2] = value[src + 2] * scale;
    out[dst + 3] = components === 4 ? value[src + 3] * scale : 1;
  }

  return out;
}

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

    // Only the standard material reads this, and only with vertexColors set —
    // carrying it costs a buffer that nothing else binds.
    const color = attributes.COLOR_0;
    if (color) {
      geometry.colors = toFloatRgba(color.value, color.components);
    }

    // If normals were not provided, compute simple vertex normals
    if (!attributes.NORMAL) geometry.computeNormals();
  }

  // Compute bounds for culling/picking
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.requiresBuild = true;
}
