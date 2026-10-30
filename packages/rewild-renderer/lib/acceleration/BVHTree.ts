/** 32-bit words in a node. Mirrors `NODE_WORDS` in the Rust `bvh` crate. */
export const NODE_WORDS = 8;

/** The count word of an internal node. Mirrors `INTERNAL` in the `bvh` crate. */
const INTERNAL = 0xffffffff;

/**
 * A BVH in the flat layout the Rust builder writes (`bvh::Node`), read in
 * place. Nodes are in pre-order: the root is node 0, a parent comes before its
 * children, and an internal node's left child is the next node.
 *
 * Each node is NODE_WORDS words:
 *   [0..2] bounds min xyz (f32)
 *   [3..5] bounds max xyz (f32)
 *   [6]    a leaf's first triangle, or an internal node's right child
 *   [7]    a leaf's triangle count, or INTERNAL
 */
export class BVHTree {
  /** The nodes as words. Transfer `words.buffer` to send the tree. */
  readonly words: Uint32Array;
  readonly nodeCount: i32;
  private readonly floats: Float32Array;

  constructor(words: Uint32Array) {
    this.words = words;
    this.nodeCount = (words.length / NODE_WORDS) | 0;
    this.floats = new Float32Array(
      words.buffer,
      words.byteOffset,
      words.length
    );
  }

  isLeaf(node: i32): boolean {
    return this.words[node * NODE_WORDS + 7] !== INTERNAL;
  }

  triangleOffset(node: i32): i32 {
    return this.words[node * NODE_WORDS + 6];
  }

  triangleCount(node: i32): i32 {
    return this.words[node * NODE_WORDS + 7];
  }

  leftChild(node: i32): i32 {
    return node + 1;
  }

  rightChild(node: i32): i32 {
    return this.words[node * NODE_WORDS + 6];
  }

  minX(node: i32): f32 {
    return this.floats[node * NODE_WORDS];
  }

  minY(node: i32): f32 {
    return this.floats[node * NODE_WORDS + 1];
  }

  minZ(node: i32): f32 {
    return this.floats[node * NODE_WORDS + 2];
  }

  maxX(node: i32): f32 {
    return this.floats[node * NODE_WORDS + 3];
  }

  maxY(node: i32): f32 {
    return this.floats[node * NODE_WORDS + 4];
  }

  maxZ(node: i32): f32 {
    return this.floats[node * NODE_WORDS + 5];
  }

  /**
   * The ray parameter where a ray enters the node's bounds, 0 when the origin
   * is inside them, or -1 when the ray misses. `invX..invZ` are the
   * reciprocals of the ray direction.
   */
  rayEntry(
    node: i32,
    originX: f32,
    originY: f32,
    originZ: f32,
    invX: f32,
    invY: f32,
    invZ: f32
  ): f32 {
    const f = this.floats;
    const o = node * NODE_WORDS;
    let tmin: f32, tmax: f32, t0: f32, t1: f32;

    if (invX >= 0) {
      tmin = (f[o] - originX) * invX;
      tmax = (f[o + 3] - originX) * invX;
    } else {
      tmin = (f[o + 3] - originX) * invX;
      tmax = (f[o] - originX) * invX;
    }

    if (invY >= 0) {
      t0 = (f[o + 1] - originY) * invY;
      t1 = (f[o + 4] - originY) * invY;
    } else {
      t0 = (f[o + 4] - originY) * invY;
      t1 = (f[o + 1] - originY) * invY;
    }
    if (tmin > t1 || t0 > tmax) return -1;
    // NaN comes from 0 * Infinity, when the ray lies on a slab's plane.
    if (t0 > tmin || tmin !== tmin) tmin = t0;
    if (t1 < tmax || tmax !== tmax) tmax = t1;

    if (invZ >= 0) {
      t0 = (f[o + 2] - originZ) * invZ;
      t1 = (f[o + 5] - originZ) * invZ;
    } else {
      t0 = (f[o + 5] - originZ) * invZ;
      t1 = (f[o + 2] - originZ) * invZ;
    }
    if (tmin > t1 || t0 > tmax) return -1;
    if (t0 > tmin || tmin !== tmin) tmin = t0;
    if (t1 < tmax || tmax !== tmax) tmax = t1;

    if (tmax < 0) return -1;
    return tmin > 0 ? tmin : 0;
  }
}
