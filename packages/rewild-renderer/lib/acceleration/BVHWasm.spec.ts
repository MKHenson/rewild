/**
 * @jest-environment node
 */
// jsdom has no TextDecoder, which the wasm-bindgen glue needs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ray, Vector3 } from 'rewild-common';
import { hasWasmSimd, loadRewildWasmSync } from '../wasm/RewildWasm';
import { buildBVHWasm } from './BVHWasm';
import { BVH } from './BVH';
import { BVHNode, BVHOptions, DEFAULT_BVH_OPTIONS } from './BVHNode';
import { Geometry } from '../geometry/Geometry';
import { buildChunkMesh } from '../renderers/terrain/worker/buildChunkMesh';
import { DEFAULT_CLIMATE_PRESET } from '../renderers/terrain/Biomes';

// The builder is held to what matters, not to a fixed tree: a valid BVH of the
// same triangles, raycasts that agree with testing every triangle, and SAH
// splits that beat midpoint splits.

const WASM = path.resolve(
  __dirname,
  '../../../rewild-wasm/pkg/rewild_wasm_bg.wasm'
);

// Loaded up front: the describe blocks below build their trees as they are
// collected, which is before any beforeAll runs.
loadRewildWasmSync(readFileSync(WASM));

interface Mesh {
  name: string;
  vertices: Float32Array;
  indices: Uint32Array | undefined;
}

/** A small terrain chunk, skirts included, as LODMesh would build. */
const terrain = (): Mesh => {
  const chunk = buildChunkMesh({
    chunkSize: 65,
    lod: 0,
    position: { x: 64, y: -128 },
    seed: 4321,
    climatePreset: DEFAULT_CLIMATE_PRESET,
    seaLevel: 0,
  });
  return { name: 'terrain', vertices: chunk.vertices, indices: chunk.indices };
};

/** Small unindexed triangles scattered in a cube. An LCG keeps it stable. */
const soup = (triangles = 2000): Mesh => {
  let state = 99;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 2 ** 32) * 100;
  };
  const vertices = new Float32Array(triangles * 9);
  for (let t = 0; t < triangles; t++) {
    const [cx, cy, cz] = [next(), next(), next()];
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      vertices[o] = cx + next() * 0.03;
      vertices[o + 1] = cy + next() * 0.03;
      vertices[o + 2] = cz + next() * 0.03;
    }
  }
  return { name: 'soup', vertices, indices: undefined };
};

const OPTION_SETS: Record<string, BVHOptions> = {
  default: DEFAULT_BVH_OPTIONS,
  // What LODMesh builds terrain with.
  terrain: { strategy: 'sah', maxDepth: 32, maxLeafTriangles: 32 },
  center: { strategy: 'center', maxDepth: 32, maxLeafTriangles: 8 },
};

/** The mesh's triangles as sorted vertex-index triples. */
const triangles = (mesh: Mesh) => {
  const indices =
    mesh.indices ??
    Uint32Array.from({ length: mesh.vertices.length / 3 }, (_, i) => i);
  return trianglesOf(indices);
};

const trianglesOf = (indices: Uint32Array) => {
  const keys: string[] = [];
  for (let t = 0; t < indices.length; t += 3)
    keys.push(`${indices[t]},${indices[t + 1]},${indices[t + 2]}`);
  return keys.sort();
};

const contains = (outer: BVHNode, min: number[], max: number[]) =>
  outer.boundingBox.min.x <= min[0] &&
  outer.boundingBox.min.y <= min[1] &&
  outer.boundingBox.min.z <= min[2] &&
  outer.boundingBox.max.x >= max[0] &&
  outer.boundingBox.max.y >= max[1] &&
  outer.boundingBox.max.z >= max[2];

/**
 * Asserts what a raycast relies on: every triangle sits in exactly one leaf,
 * each node's bounds contain its triangles and children, and no leaf is
 * deeper than the limit.
 */
function expectValid(
  root: BVHNode,
  triIndices: Uint32Array,
  mesh: Mesh,
  options: BVHOptions
) {
  expect(trianglesOf(triIndices)).toEqual(triangles(mesh));

  const covered = new Uint8Array(triIndices.length / 3);
  const stack: [BVHNode, number][] = [[root, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    expect(depth).toBeLessThanOrEqual(options.maxDepth);

    if (node.isLeaf) {
      for (
        let t = node.triangleOffset;
        t < node.triangleOffset + node.triangleCount;
        t++
      ) {
        covered[t]++;
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let v = 0; v < 3; v++) {
          const i = triIndices[t * 3 + v] * 3;
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], mesh.vertices[i + k]);
            max[k] = Math.max(max[k], mesh.vertices[i + k]);
          }
        }
        expect(contains(node, min, max)).toBe(true);
      }
      continue;
    }

    for (const child of [node.leftChild!, node.rightChild!]) {
      const { min, max } = child.boundingBox;
      expect(contains(node, [min.x, min.y, min.z], [max.x, max.y, max.z])).toBe(
        true
      );
      stack.push([child, depth + 1]);
    }
  }
  expect(covered.every((c) => c === 1)).toBe(true);
}

const area = (node: BVHNode) => {
  const { min, max } = node.boundingBox;
  const [dx, dy, dz] = [max.x - min.x, max.y - min.y, max.z - min.z];
  return 2 * (dx * dy + dy * dz + dz * dx);
};

/** Expected cost of a raycast through the tree, by the surface area heuristic. */
function sahCost(node: BVHNode): number {
  if (node.isLeaf) return node.triangleCount;
  const parent = area(node);
  if (parent === 0) return node.triangleCount;
  const left = node.leftChild!;
  const right = node.rightChild!;
  return (
    1 + (area(left) * sahCost(left) + area(right) * sahCost(right)) / parent
  );
}

/** Rays through the mesh's bounds, from outside it, in a stable spread. */
function rays(mesh: Mesh, count: number): Ray[] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.vertices[i + k]);
      max[k] = Math.max(max[k], mesh.vertices[i + k]);
    }

  let state = 7;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const at = (k: number) => min[k] + next() * (max[k] - min[k]);

  const result: Ray[] = [];
  for (let i = 0; i < count; i++) {
    // From high above, towards a point inside the bounds, at up to ~45°.
    const target = new Vector3(at(0), at(1), at(2));
    const origin = new Vector3(
      target.x + (next() - 0.5) * (max[0] - min[0]),
      max[1] + (max[1] - min[1]) + 10,
      target.z + (next() - 0.5) * (max[2] - min[2])
    );
    result.push(new Ray(origin, target.sub(origin).normalize()));
  }
  return result;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _hit = new Vector3();

/** Distance to the closest double-sided hit, testing every triangle. */
function bruteForceFirst(mesh: Mesh, ray: Ray): number | null {
  const count = mesh.indices ? mesh.indices.length : mesh.vertices.length / 3;
  let closest: number | null = null;
  for (let t = 0; t < count; t += 3) {
    const i = (v: number) => (mesh.indices ? mesh.indices[t + v] : t + v) * 3;
    _a.fromBuffer(i(0), mesh.vertices);
    _b.fromBuffer(i(1), mesh.vertices);
    _c.fromBuffer(i(2), mesh.vertices);
    if (!ray.intersectTriangle(_a, _b, _c, false, _hit)) continue;
    const distance = ray.origin.distanceTo(_hit);
    if (closest === null || distance < closest) closest = distance;
  }
  return closest;
}

const asGeometry = (mesh: Mesh) =>
  ({ vertices: mesh.vertices, indices: mesh.indices }) as Geometry;

it('detects WASM SIMD', () => {
  expect(hasWasmSimd()).toBe(true);
});

describe('BVH', () => {
  for (const mesh of [terrain(), soup()]) {
    for (const [name, options] of Object.entries(OPTION_SETS)) {
      describe(`${mesh.name}, ${name} options`, () => {
        const bvh = new BVH(asGeometry(mesh), options);

        it('builds a valid BVH of the same triangles', () => {
          expect(bvh.isReady).toBe(true);
          expectValid(bvh.root, bvh.triIndices, mesh, options);
        });

        it('hits what a brute-force raycast hits, at the same distance', () => {
          let hits = 0;
          for (const ray of rays(mesh, 300)) {
            const expected = bruteForceFirst(mesh, ray);
            const hit = bvh.raycastFirst(ray, 'none', 0, Infinity);
            expect(hit === null).toBe(expected === null);
            if (hit && expected !== null) {
              hits++;
              expect(hit.distance).toBeCloseTo(expected, 4);
            }
          }
          // Guard against a pass where nothing was hit.
          expect(hits).toBeGreaterThan(20);
        });
      });
    }

    it(`${mesh.name}: SAH builds a cheaper tree than midpoint splits`, () => {
      const sah = new BVH(asGeometry(mesh), OPTION_SETS.default);
      const center = new BVH(asGeometry(mesh), OPTION_SETS.center);
      expect(sahCost(sah.root)).toBeLessThan(sahCost(center.root));
    });
  }
});

describe('buildBVHWasm', () => {
  it('writes 11 floats for each node', () => {
    const { vertices } = soup(100);
    const built = buildBVHWasm(vertices, undefined, DEFAULT_BVH_OPTIONS);
    expect(built.nodes).toHaveLength(built.nodeCount * 11);
  });

  it('rejects an unknown strategy', () => {
    const { vertices } = soup(10);
    expect(() =>
      buildBVHWasm(vertices, undefined, {
        ...DEFAULT_BVH_OPTIONS,
        strategy: 'octree' as BVHOptions['strategy'],
      })
    ).toThrow(/unknown BVH strategy/);
  });
});
