import { Box3, Vector3 } from 'rewild-common';
import {
  BVHNode,
  BVHOptions,
  DEFAULT_BVH_OPTIONS,
  TriangleInfo,
} from './BVHNode';

const _size = new Vector3();

/** Number of SAH buckets for split evaluation. */
const SAH_BUCKETS = 12;

/** Cost ratio: traversal step vs triangle intersection test. */
const TRAVERSAL_COST = 1.0;
const INTERSECTION_COST = 1.0;

/**
 * Builds a BVH tree from geometry vertex/index data.
 *
 * The builder reorders an internal triangle index array so that each leaf node
 * references a contiguous range. The original geometry buffers are not modified.
 */
export class BVHBuilder {
  private vertices: Float32Array;
  private options: BVHOptions;

  /**
   * Reordered triangle indices. Each triple (triIndices[i*3], triIndices[i*3+1],
   * triIndices[i*3+2]) gives the vertex indices of a triangle. Leaf nodes
   * reference contiguous slices of this array.
   */
  triIndices: Uint32Array;

  /** Total number of triangles. */
  triCount: i32;

  constructor(
    vertices: Float32Array,
    indices: Uint32Array | undefined,
    options?: Partial<BVHOptions>
  ) {
    this.vertices = vertices;
    this.options = { ...DEFAULT_BVH_OPTIONS, ...options };

    if (indices) {
      // Indexed geometry — copy indices so we can reorder them.
      this.triCount = (indices.length / 3) | 0;
      this.triIndices = new Uint32Array(indices);
    } else {
      // Non-indexed: vertex i*3 .. i*3+2 form triangle i.
      // Create sequential indices.
      const vertexCount = (vertices.length / 3) | 0;
      this.triCount = (vertexCount / 3) | 0;
      this.triIndices = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) {
        this.triIndices[i] = i;
      }
    }
  }

  /** Build and return the root BVH node. */
  build(): BVHNode {
    const info = this.precomputeTriangleInfo();
    // triOrder[i] = original triangle index at position i.
    // This is what we swap during partitioning, then use to reorder triIndices.
    const triOrder = new Uint32Array(this.triCount);
    for (let i = 0; i < this.triCount; i++) {
      triOrder[i] = i;
    }

    const root = this.buildRecursive(info, triOrder, 0, this.triCount, 0);

    // Reorder triIndices to match the final triOrder.
    this.reorderTriIndices(triOrder);

    return root;
  }

  /**
   * Precompute per-triangle centroid and bounding box.
   * Done once to avoid redundant vertex lookups during split evaluation.
   */
  private precomputeTriangleInfo(): TriangleInfo {
    const { vertices, triIndices, triCount } = this;
    const centroids = new Float32Array(triCount * 3);
    const bboxMin = new Float32Array(triCount * 3);
    const bboxMax = new Float32Array(triCount * 3);

    for (let t = 0; t < triCount; t++) {
      const i0 = triIndices[t * 3] * 3;
      const i1 = triIndices[t * 3 + 1] * 3;
      const i2 = triIndices[t * 3 + 2] * 3;

      const ax = vertices[i0],
        ay = vertices[i0 + 1],
        az = vertices[i0 + 2];
      const bx = vertices[i1],
        by = vertices[i1 + 1],
        bz = vertices[i1 + 2];
      const cx = vertices[i2],
        cy = vertices[i2 + 1],
        cz = vertices[i2 + 2];

      const o = t * 3;
      centroids[o] = (ax + bx + cx) / 3;
      centroids[o + 1] = (ay + by + cy) / 3;
      centroids[o + 2] = (az + bz + cz) / 3;

      bboxMin[o] = Math.min(ax, bx, cx);
      bboxMin[o + 1] = Math.min(ay, by, cy);
      bboxMin[o + 2] = Math.min(az, bz, cz);

      bboxMax[o] = Math.max(ax, bx, cx);
      bboxMax[o + 1] = Math.max(ay, by, cy);
      bboxMax[o + 2] = Math.max(az, bz, cz);
    }

    return { centroids, bboxMin, bboxMax };
  }

  /**
   * Recursively build BVH nodes for triangles triOrder[start..end).
   */
  private buildRecursive(
    info: TriangleInfo,
    triOrder: Uint32Array,
    start: i32,
    end: i32,
    depth: i32
  ): BVHNode {
    const node = new BVHNode();
    const count = end - start;

    // Compute bounding box for this subset.
    this.computeNodeBounds(info, triOrder, start, end, node.boundingBox);

    // Leaf conditions.
    if (
      count <= this.options.maxLeafTriangles ||
      depth >= this.options.maxDepth
    ) {
      node.isLeaf = true;
      node.triangleOffset = start;
      node.triangleCount = count;
      return node;
    }

    // Find best split.
    const split =
      this.options.strategy === 'sah'
        ? this.findSAHSplit(info, triOrder, start, end, node.boundingBox)
        : this.findCenterSplit(info, triOrder, start, end, node.boundingBox);

    // If splitting failed (all centroids in same bucket), make a leaf.
    if (split.index <= start || split.index >= end) {
      node.isLeaf = true;
      node.triangleOffset = start;
      node.triangleCount = count;
      return node;
    }

    // Recurse.
    node.leftChild = this.buildRecursive(
      info,
      triOrder,
      start,
      split.index,
      depth + 1
    );
    node.rightChild = this.buildRecursive(
      info,
      triOrder,
      split.index,
      end,
      depth + 1
    );

    return node;
  }

  /** Compute an AABB enclosing triangles triOrder[start..end). */
  private computeNodeBounds(
    info: TriangleInfo,
    triOrder: Uint32Array,
    start: i32,
    end: i32,
    target: Box3
  ): void {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = start; i < end; i++) {
      const t = triOrder[i];
      const o = t * 3;

      const tMinX = info.bboxMin[o],
        tMinY = info.bboxMin[o + 1],
        tMinZ = info.bboxMin[o + 2];
      const tMaxX = info.bboxMax[o],
        tMaxY = info.bboxMax[o + 1],
        tMaxZ = info.bboxMax[o + 2];

      if (tMinX < minX) minX = tMinX;
      if (tMinY < minY) minY = tMinY;
      if (tMinZ < minZ) minZ = tMinZ;
      if (tMaxX > maxX) maxX = tMaxX;
      if (tMaxY > maxY) maxY = tMaxY;
      if (tMaxZ > maxZ) maxZ = tMaxZ;
    }

    target.min.set(minX, minY, minZ);
    target.max.set(maxX, maxY, maxZ);
  }

  /**
   * SAH (Surface Area Heuristic) split.
   * Evaluates buckets along each axis and picks the split with lowest cost.
   */
  private findSAHSplit(
    info: TriangleInfo,
    triOrder: Uint32Array,
    start: i32,
    end: i32,
    nodeBounds: Box3
  ): { axis: i32; index: i32 } {
    nodeBounds.getSize(_size);
    const count = end - start;

    let bestCost = Infinity;
    let bestAxis: i32 = 0;
    let bestSplitIndex: i32 = start;

    // Try each axis.
    for (let axis: i32 = 0; axis < 3; axis++) {
      const axisSize = axis === 0 ? _size.x : axis === 1 ? _size.y : _size.z;
      if (axisSize <= 0) continue;

      const axisMin =
        axis === 0
          ? nodeBounds.min.x
          : axis === 1
          ? nodeBounds.min.y
          : nodeBounds.min.z;

      // Bin triangles into buckets by centroid.
      const bucketCounts = new Int32Array(SAH_BUCKETS);
      const bucketBBoxMin = new Float32Array(SAH_BUCKETS * 3);
      const bucketBBoxMax = new Float32Array(SAH_BUCKETS * 3);

      // Initialize bucket bboxes to empty.
      for (let b = 0; b < SAH_BUCKETS; b++) {
        const bo = b * 3;
        bucketBBoxMin[bo] = Infinity;
        bucketBBoxMin[bo + 1] = Infinity;
        bucketBBoxMin[bo + 2] = Infinity;
        bucketBBoxMax[bo] = -Infinity;
        bucketBBoxMax[bo + 1] = -Infinity;
        bucketBBoxMax[bo + 2] = -Infinity;
      }

      for (let i = start; i < end; i++) {
        const t = triOrder[i];
        const centroidVal = info.centroids[t * 3 + axis];
        let bucket = (((centroidVal - axisMin) / axisSize) * SAH_BUCKETS) | 0;
        if (bucket >= SAH_BUCKETS) bucket = SAH_BUCKETS - 1;
        if (bucket < 0) bucket = 0;

        bucketCounts[bucket]++;

        // Expand bucket bounds.
        const bo = bucket * 3;
        const to = t * 3;
        if (info.bboxMin[to] < bucketBBoxMin[bo])
          bucketBBoxMin[bo] = info.bboxMin[to];
        if (info.bboxMin[to + 1] < bucketBBoxMin[bo + 1])
          bucketBBoxMin[bo + 1] = info.bboxMin[to + 1];
        if (info.bboxMin[to + 2] < bucketBBoxMin[bo + 2])
          bucketBBoxMin[bo + 2] = info.bboxMin[to + 2];
        if (info.bboxMax[to] > bucketBBoxMax[bo])
          bucketBBoxMax[bo] = info.bboxMax[to];
        if (info.bboxMax[to + 1] > bucketBBoxMax[bo + 1])
          bucketBBoxMax[bo + 1] = info.bboxMax[to + 1];
        if (info.bboxMax[to + 2] > bucketBBoxMax[bo + 2])
          bucketBBoxMax[bo + 2] = info.bboxMax[to + 2];
      }

      // Sweep from left and right to compute costs for each split plane.
      // leftArea[i]  = surface area of union of buckets [0..i]
      // leftCount[i] = triangle count in buckets [0..i]
      const leftArea = new Float32Array(SAH_BUCKETS - 1);
      const leftCount = new Int32Array(SAH_BUCKETS - 1);
      const rightArea = new Float32Array(SAH_BUCKETS - 1);
      const rightCount = new Int32Array(SAH_BUCKETS - 1);

      // Left sweep.
      let lMinX = Infinity,
        lMinY = Infinity,
        lMinZ = Infinity;
      let lMaxX = -Infinity,
        lMaxY = -Infinity,
        lMaxZ = -Infinity;
      let lCnt = 0;

      for (let b = 0; b < SAH_BUCKETS - 1; b++) {
        const bo = b * 3;
        lCnt += bucketCounts[b];
        if (bucketCounts[b] > 0) {
          if (bucketBBoxMin[bo] < lMinX) lMinX = bucketBBoxMin[bo];
          if (bucketBBoxMin[bo + 1] < lMinY) lMinY = bucketBBoxMin[bo + 1];
          if (bucketBBoxMin[bo + 2] < lMinZ) lMinZ = bucketBBoxMin[bo + 2];
          if (bucketBBoxMax[bo] > lMaxX) lMaxX = bucketBBoxMax[bo];
          if (bucketBBoxMax[bo + 1] > lMaxY) lMaxY = bucketBBoxMax[bo + 1];
          if (bucketBBoxMax[bo + 2] > lMaxZ) lMaxZ = bucketBBoxMax[bo + 2];
        }
        leftCount[b] = lCnt;
        leftArea[b] =
          lCnt > 0 ? surfaceArea(lMinX, lMinY, lMinZ, lMaxX, lMaxY, lMaxZ) : 0;
      }

      // Right sweep.
      let rMinX = Infinity,
        rMinY = Infinity,
        rMinZ = Infinity;
      let rMaxX = -Infinity,
        rMaxY = -Infinity,
        rMaxZ = -Infinity;
      let rCnt = 0;

      for (let b = SAH_BUCKETS - 1; b > 0; b--) {
        const bo = b * 3;
        rCnt += bucketCounts[b];
        if (bucketCounts[b] > 0) {
          if (bucketBBoxMin[bo] < rMinX) rMinX = bucketBBoxMin[bo];
          if (bucketBBoxMin[bo + 1] < rMinY) rMinY = bucketBBoxMin[bo + 1];
          if (bucketBBoxMin[bo + 2] < rMinZ) rMinZ = bucketBBoxMin[bo + 2];
          if (bucketBBoxMax[bo] > rMaxX) rMaxX = bucketBBoxMax[bo];
          if (bucketBBoxMax[bo + 1] > rMaxY) rMaxY = bucketBBoxMax[bo + 1];
          if (bucketBBoxMax[bo + 2] > rMaxZ) rMaxZ = bucketBBoxMax[bo + 2];
        }
        rightCount[b - 1] = rCnt;
        rightArea[b - 1] =
          rCnt > 0 ? surfaceArea(rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ) : 0;
      }

      // Evaluate each split plane.
      const parentArea = surfaceArea(
        nodeBounds.min.x,
        nodeBounds.min.y,
        nodeBounds.min.z,
        nodeBounds.max.x,
        nodeBounds.max.y,
        nodeBounds.max.z
      );

      for (let b = 0; b < SAH_BUCKETS - 1; b++) {
        if (leftCount[b] === 0 || rightCount[b] === 0) continue;

        const cost =
          TRAVERSAL_COST +
          (INTERSECTION_COST *
            (leftCount[b] * leftArea[b] + rightCount[b] * rightArea[b])) /
            parentArea;

        if (cost < bestCost) {
          bestCost = cost;
          bestAxis = axis;
          bestSplitIndex = start + leftCount[b];
        }
      }
    }

    // No useful split found — let the caller create a leaf.
    const leafCost = INTERSECTION_COST * count;
    if (bestCost >= leafCost) {
      return { axis: bestAxis, index: start };
    }

    // Partition triOrder[start..end) so that the first (bestSplitIndex-start)
    // entries have centroids in the left half on bestAxis.
    this.partitionByBucket(
      info,
      triOrder,
      start,
      end,
      bestAxis,
      nodeBounds,
      bestSplitIndex - start
    );

    return { axis: bestAxis, index: bestSplitIndex };
  }

  /**
   * Simple center (midpoint) split along the longest axis.
   */
  private findCenterSplit(
    info: TriangleInfo,
    triOrder: Uint32Array,
    start: i32,
    end: i32,
    nodeBounds: Box3
  ): { axis: i32; index: i32 } {
    nodeBounds.getSize(_size);

    // Pick longest axis.
    let axis: i32 = 0;
    if (_size.y > _size.x) axis = 1;
    if (_size.z > (axis === 0 ? _size.x : _size.y)) axis = 2;

    const mid =
      axis === 0
        ? nodeBounds.min.x + _size.x * 0.5
        : axis === 1
        ? nodeBounds.min.y + _size.y * 0.5
        : nodeBounds.min.z + _size.z * 0.5;

    // Partition by centroid vs midpoint.
    let left = start;
    let right = end - 1;

    while (left <= right) {
      while (left < end && info.centroids[triOrder[left] * 3 + axis] < mid) {
        left++;
      }
      while (
        right >= start &&
        info.centroids[triOrder[right] * 3 + axis] >= mid
      ) {
        right--;
      }
      if (left < right) {
        const tmp = triOrder[left];
        triOrder[left] = triOrder[right];
        triOrder[right] = tmp;
        left++;
        right--;
      }
    }

    // Fallback: if everything ended up on one side, split in the middle.
    if (left === start || left === end) {
      left = (start + end) >> 1;
    }

    return { axis, index: left };
  }

  /**
   * Partition triOrder[start..end) so that the first `leftCount` entries
   * correspond to the SAH-chosen left side on the given axis and node bounds.
   */
  private partitionByBucket(
    info: TriangleInfo,
    triOrder: Uint32Array,
    start: i32,
    end: i32,
    axis: i32,
    _nodeBounds: Box3,
    leftCount: i32
  ): void {
    // Collect centroid values for the axis.
    const centroids = new Float32Array(end - start);
    for (let i = start; i < end; i++) {
      centroids[i - start] = info.centroids[triOrder[i] * 3 + axis];
    }

    // Find the nth centroid value (leftCount-th smallest).
    // Use a partial sort via partitioning.
    nthElement(triOrder, centroids, 0, end - start - 1, leftCount, start);
  }

  /**
   * After the recursive build, reorder triIndices so that
   * leaf node ranges [offset, offset+count) directly index contiguous triples.
   */
  private reorderTriIndices(triOrder: Uint32Array): void {
    const oldIndices = new Uint32Array(this.triIndices);
    for (let i = 0; i < this.triCount; i++) {
      const src = triOrder[i];
      this.triIndices[i * 3] = oldIndices[src * 3];
      this.triIndices[i * 3 + 1] = oldIndices[src * 3 + 1];
      this.triIndices[i * 3 + 2] = oldIndices[src * 3 + 2];
    }
  }
}

/**
 * In-place nth-element partition.
 * After this call, triOrder[start + n] contains the element that would be at
 * position n in a sorted array, and all elements before it are ≤ it.
 *
 * `values` array corresponds to triOrder[startOffset..startOffset+length].
 */
function nthElement(
  triOrder: Uint32Array,
  values: Float32Array,
  lo: i32,
  hi: i32,
  n: i32,
  orderOffset: i32
): void {
  while (lo < hi) {
    // Median-of-three pivot.
    const mid = (lo + hi) >> 1;
    if (values[mid] < values[lo]) {
      swapBoth(triOrder, values, lo, mid, orderOffset);
    }
    if (values[hi] < values[lo]) {
      swapBoth(triOrder, values, lo, hi, orderOffset);
    }
    if (values[mid] < values[hi]) {
      swapBoth(triOrder, values, mid, hi, orderOffset);
    }
    const pivot = values[hi];

    let i = lo;
    let j = hi - 1;
    while (true) {
      while (values[i] < pivot) i++;
      while (j > i && values[j] >= pivot) j--;
      if (i >= j) break;
      swapBoth(triOrder, values, i, j, orderOffset);
      i++;
      j--;
    }
    swapBoth(triOrder, values, i, hi, orderOffset);

    if (i === n) return;
    if (i < n) lo = i + 1;
    else hi = i - 1;
  }
}

function swapBoth(
  triOrder: Uint32Array,
  values: Float32Array,
  a: i32,
  b: i32,
  orderOffset: i32
): void {
  const tmpV = values[a];
  values[a] = values[b];
  values[b] = tmpV;

  const oa = a + orderOffset;
  const ob = b + orderOffset;
  const tmpO = triOrder[oa];
  triOrder[oa] = triOrder[ob];
  triOrder[ob] = tmpO;
}

/** Surface area of an AABB given min/max coordinates. */
function surfaceArea(
  minX: f32,
  minY: f32,
  minZ: f32,
  maxX: f32,
  maxY: f32,
  maxZ: f32
): f32 {
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  return 2 * (dx * dy + dy * dz + dz * dx);
}
