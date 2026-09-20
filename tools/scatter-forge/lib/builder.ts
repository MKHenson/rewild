// The vertex builder every piece is written through, and the frozen layout
// the glTF writer consumes. On its own so that a module which only writes
// vertices need not import the tree's mesh, and the mesh can import it back.

import type { Vec3 } from './vec.ts';

/** One primitive's vertex data, in the layout the glTF writer consumes. */
export interface MeshAttributes {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

/** Attributes while they are still growing, before they are frozen. */
export interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export type Rgba = [number, number, number, number];

export function createBuilder(): Builder {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

export function pushVertex(
  out: Builder,
  position: Vec3,
  normal: Vec3,
  uv: [number, number],
  color: Rgba
): number {
  out.positions.push(position[0], position[1], position[2]);
  out.normals.push(normal[0], normal[1], normal[2]);
  out.uvs.push(uv[0], uv[1]);
  out.colors.push(color[0], color[1], color[2], color[3]);
  return out.positions.length / 3 - 1;
}

export function finish(out: Builder): MeshAttributes {
  return {
    positions: new Float32Array(out.positions),
    normals: new Float32Array(out.normals),
    uvs: new Float32Array(out.uvs),
    colors: new Float32Array(out.colors),
    indices: new Uint32Array(out.indices),
    vertexCount: out.positions.length / 3,
    triangleCount: out.indices.length / 3,
  };
}
