//! Bounding volume hierarchy over a triangle mesh.
//!
//! The output is a flat array of `Node`s, which `BVHTree.ts` reads in place.

use math::{fast_max, fast_min};

/// `Node::count` of an internal node.
pub const INTERNAL: u32 = u32::MAX;

/// 32-bit words in a `Node`. Mirrors `NODE_WORDS` in `BVHTree.ts`.
pub const NODE_WORDS: usize = 8;

/// One node of the tree. Mirrors the layout of `BVHTree.ts`.
///
/// Nodes are stored in pre-order, so a parent comes before its children and an
/// internal node's left child is the next node.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Node {
    pub min: [f32; 3],
    pub max: [f32; 3],
    /// A leaf's first triangle, or an internal node's right child.
    pub first: u32,
    /// A leaf's triangle count, or `INTERNAL`.
    pub count: u32,
}

impl Node {
    fn leaf(aabb: &Aabb, first: usize, count: usize) -> Node {
        Node {
            min: aabb.min,
            max: aabb.max,
            first: first as u32,
            count: count as u32,
        }
    }

    fn internal(aabb: &Aabb, right: usize) -> Node {
        Node {
            min: aabb.min,
            max: aabb.max,
            first: right as u32,
            count: INTERNAL,
        }
    }

    pub fn is_leaf(&self) -> bool {
        self.count != INTERNAL
    }

    /// The nodes stored in `words`, `NODE_WORDS` words each.
    pub fn from_words_mut(words: &mut [u32]) -> &mut [Node] {
        assert_eq!(words.len() % NODE_WORDS, 0, "not a whole number of nodes");
        // SAFETY: `Node` is `repr(C)` with only 4-byte `f32` and `u32` fields,
        // so it has no padding, the alignment of `u32`, and every bit pattern
        // is a valid `Node`.
        let (head, nodes, tail) = unsafe { words.align_to_mut::<Node>() };
        assert!(head.is_empty() && tail.is_empty());
        nodes
    }
}

/// Buckets for each axis when the SAH split is evaluated.
const SAH_BUCKETS: usize = 12;

/// Cost of one traversal step against one triangle test.
const TRAVERSAL_COST: f32 = 1.0;
const INTERSECTION_COST: f32 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy {
    /// Surface area heuristic. Better trees, slower builds.
    Sah,
    /// Midpoint of the longest axis. Faster builds.
    Center,
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
    pub strategy: Strategy,
    /// A node at this depth becomes a leaf.
    pub max_depth: u32,
    /// A node with this many triangles or fewer becomes a leaf.
    pub max_leaf_triangles: u32,
}

impl Default for Options {
    /// Mirrors `DEFAULT_BVH_OPTIONS` in `BVHNode.ts`.
    fn default() -> Self {
        Options {
            strategy: Strategy::Sah,
            max_depth: 32,
            max_leaf_triangles: 8,
        }
    }
}

/// A built BVH.
pub struct Bvh {
    /// The root is node 0.
    pub nodes: Vec<Node>,
    /// The mesh's triangles, reordered so each leaf covers the contiguous
    /// triangles `[tri_offset, tri_offset + tri_count)`. Three vertex indices
    /// for each triangle.
    pub tri_indices: Vec<u32>,
}

#[derive(Clone, Copy, Debug)]
struct Aabb {
    min: [f32; 3],
    max: [f32; 3],
}

impl Aabb {
    const EMPTY: Aabb = Aabb {
        min: [f32::INFINITY; 3],
        max: [f32::NEG_INFINITY; 3],
    };

    fn grow(&mut self, other: &Aabb) {
        for k in 0..3 {
            self.min[k] = fast_min(self.min[k], other.min[k]);
            self.max[k] = fast_max(self.max[k], other.max[k]);
        }
    }

    fn size(&self) -> [f32; 3] {
        [
            self.max[0] - self.min[0],
            self.max[1] - self.min[1],
            self.max[2] - self.min[2],
        ]
    }

    fn surface_area(&self) -> f32 {
        let [dx, dy, dz] = self.size();
        2.0 * (dx * dy + dy * dz + dz * dx)
    }
}

/// Builds a BVH over `vertices` (flat xyz).
///
/// With `indices`, each three indices form a triangle. Without, each three
/// vertices do.
pub fn build(vertices: &[f32], indices: Option<&[u32]>, options: Options) -> Bvh {
    let tri_indices: Vec<u32> = match indices {
        Some(indices) => indices.to_vec(),
        None => (0..(vertices.len() / 3) as u32).collect(),
    };
    let tri_count = tri_indices.len() / 3;

    let mut builder = Builder::new(vertices, &tri_indices, tri_count, options);
    builder.build_node(0, tri_count, 0);

    // Lay the triangles out in leaf order.
    let mut reordered = Vec::with_capacity(tri_count * 3);
    for &t in &builder.order {
        let t = t as usize * 3;
        reordered.extend_from_slice(&tri_indices[t..t + 3]);
    }

    Bvh {
        nodes: builder.nodes,
        tri_indices: reordered,
    }
}

impl Bvh {
    /// The nodes as `NODE_WORDS` words each, the layout `BVHTree.ts` reads.
    pub fn node_words(&self) -> Vec<u32> {
        let mut words = Vec::with_capacity(self.nodes.len() * NODE_WORDS);
        for node in &self.nodes {
            words.extend_from_slice(&[
                node.min[0].to_bits(),
                node.min[1].to_bits(),
                node.min[2].to_bits(),
                node.max[0].to_bits(),
                node.max[1].to_bits(),
                node.max[2].to_bits(),
                node.first,
                node.count,
            ]);
        }
        words
    }
}

/// Recomputes every node's bounds from `vertices` after they move, keeping
/// the tree's shape. `tri_indices` are the tree's reordered triangles.
pub fn refit(nodes: &mut [Node], vertices: &[f32], tri_indices: &[u32]) {
    // Children come after their parent, so a reverse walk sees them first.
    for i in (0..nodes.len()).rev() {
        let node = nodes[i];
        let mut aabb = Aabb::EMPTY;
        if node.is_leaf() {
            // One box for each corner, so the three min/max chains run in
            // parallel instead of each waiting on the last.
            let mut corners = [Aabb::EMPTY; 3];
            let first = node.first as usize * 3;
            for tri in tri_indices[first..first + node.count as usize * 3].chunks_exact(3) {
                for (corner, &v) in corners.iter_mut().zip(tri) {
                    let v = v as usize * 3;
                    let p = &vertices[v..v + 3];
                    for k in 0..3 {
                        corner.min[k] = fast_min(corner.min[k], p[k]);
                        corner.max[k] = fast_max(corner.max[k], p[k]);
                    }
                }
            }
            for corner in &corners {
                aabb.grow(corner);
            }
        } else {
            for child in [&nodes[i + 1], &nodes[node.first as usize]] {
                aabb.grow(&Aabb {
                    min: child.min,
                    max: child.max,
                });
            }
        }
        nodes[i].min = aabb.min;
        nodes[i].max = aabb.max;
    }
}

struct Builder {
    options: Options,
    /// Each triangle's centroid and bounds, computed once.
    centroids: Vec<[f32; 3]>,
    bounds: Vec<Aabb>,
    /// `order[i]` is the triangle at position `i`. Splits partition ranges of
    /// it, so each node covers a contiguous range.
    order: Vec<u32>,
    nodes: Vec<Node>,
    /// Reused by every SAH partition.
    partition: Vec<(f32, u32)>,
}

impl Builder {
    fn new(vertices: &[f32], tri_indices: &[u32], tri_count: usize, options: Options) -> Self {
        let vertex = |i: u32| {
            let i = i as usize * 3;
            [vertices[i], vertices[i + 1], vertices[i + 2]]
        };

        let mut centroids = Vec::with_capacity(tri_count);
        let mut bounds = Vec::with_capacity(tri_count);
        for tri in tri_indices.chunks_exact(3) {
            let (a, b, c) = (vertex(tri[0]), vertex(tri[1]), vertex(tri[2]));
            let mut centroid = [0.0; 3];
            let mut aabb = Aabb::EMPTY;
            for k in 0..3 {
                centroid[k] = (a[k] + b[k] + c[k]) / 3.0;
                aabb.min[k] = fast_min(fast_min(a[k], b[k]), c[k]);
                aabb.max[k] = fast_max(fast_max(a[k], b[k]), c[k]);
            }
            centroids.push(centroid);
            bounds.push(aabb);
        }

        Builder {
            options,
            centroids,
            bounds,
            order: (0..tri_count as u32).collect(),
            // A binary tree over n leaves has under 2n nodes, and SAH leaves
            // hold a few triangles each, so this rarely grows.
            nodes: Vec::with_capacity(tri_count / 2),
            partition: Vec::new(),
        }
    }

    /// Builds the node for triangles `order[start..end)` and its subtree.
    /// Returns its index.
    fn build_node(&mut self, start: usize, end: usize, depth: u32) -> usize {
        // Nodes are written in pre-order, so a parent always precedes its
        // children. The slot is filled in once the children are known.
        let index = self.nodes.len();
        self.nodes.push(Node::leaf(&Aabb::EMPTY, 0, 0));

        let mut aabb = Aabb::EMPTY;
        for &t in &self.order[start..end] {
            aabb.grow(&self.bounds[t as usize]);
        }

        let count = end - start;
        if count <= self.options.max_leaf_triangles as usize || depth >= self.options.max_depth {
            self.nodes[index] = Node::leaf(&aabb, start, count);
            return index;
        }

        let split = match self.options.strategy {
            Strategy::Sah => self.sah_split(start, end, &aabb),
            Strategy::Center => self.center_split(start, end, &aabb),
        };
        // No split separates the triangles.
        if split <= start || split >= end {
            self.nodes[index] = Node::leaf(&aabb, start, count);
            return index;
        }

        self.build_node(start, split, depth + 1);
        let right = self.build_node(split, end, depth + 1);
        self.nodes[index] = Node::internal(&aabb, right);
        index
    }

    /// Picks the cheapest bucket boundary on any axis by the surface area
    /// heuristic and partitions the range at it. Returns the split position,
    /// or `start` when a leaf is cheaper than every split.
    fn sah_split(&mut self, start: usize, end: usize, aabb: &Aabb) -> usize {
        const B: usize = SAH_BUCKETS;
        let size = aabb.size();
        let parent_area = aabb.surface_area();

        let mut best_cost = f32::INFINITY;
        let mut best_axis = 0;
        let mut best_left = 0;

        for axis in 0..3 {
            if size[axis] <= 0.0 {
                continue;
            }
            let axis_min = aabb.min[axis];
            let scale = B as f32 / size[axis];

            let mut counts = [0usize; B];
            let mut buckets = [Aabb::EMPTY; B];
            for &t in &self.order[start..end] {
                let t = t as usize;
                // `as` truncates toward zero and maps NaN to 0.
                let b = (((self.centroids[t][axis] - axis_min) * scale) as usize).min(B - 1);
                counts[b] += 1;
                buckets[b].grow(&self.bounds[t]);
            }

            // left_*[b] covers buckets 0..=b, right_*[b] covers b+1..B.
            let mut left_area = [0.0f32; B - 1];
            let mut left_count = [0usize; B - 1];
            let mut right_area = [0.0f32; B - 1];
            let mut right_count = [0usize; B - 1];

            let mut acc = Aabb::EMPTY;
            let mut n = 0;
            for b in 0..B - 1 {
                n += counts[b];
                if counts[b] > 0 {
                    acc.grow(&buckets[b]);
                }
                left_count[b] = n;
                left_area[b] = if n > 0 { acc.surface_area() } else { 0.0 };
            }

            acc = Aabb::EMPTY;
            n = 0;
            for b in (1..B).rev() {
                n += counts[b];
                if counts[b] > 0 {
                    acc.grow(&buckets[b]);
                }
                right_count[b - 1] = n;
                right_area[b - 1] = if n > 0 { acc.surface_area() } else { 0.0 };
            }

            for b in 0..B - 1 {
                if left_count[b] == 0 || right_count[b] == 0 {
                    continue;
                }
                let cost = TRAVERSAL_COST
                    + INTERSECTION_COST
                        * (left_count[b] as f32 * left_area[b]
                            + right_count[b] as f32 * right_area[b])
                        / parent_area;
                if cost < best_cost {
                    best_cost = cost;
                    best_axis = axis;
                    best_left = left_count[b];
                }
            }
        }

        let leaf_cost = INTERSECTION_COST * (end - start) as f32;
        if best_cost >= leaf_cost {
            return start;
        }

        // Put the `best_left` triangles with the smallest centroids on the
        // best axis first. That is the bucket split, without bucketing again.
        self.partition.clear();
        for &t in &self.order[start..end] {
            self.partition
                .push((self.centroids[t as usize][best_axis], t));
        }
        self.partition
            .select_nth_unstable_by(best_left, |a, b| a.0.total_cmp(&b.0));
        for (slot, &(_, t)) in self.order[start..end].iter_mut().zip(&self.partition) {
            *slot = t;
        }

        start + best_left
    }

    /// Splits at the midpoint of the longest axis. Falls back to the middle
    /// of the range when every centroid lands on one side.
    fn center_split(&mut self, start: usize, end: usize, aabb: &Aabb) -> usize {
        let size = aabb.size();
        let mut axis = 0;
        if size[1] > size[0] {
            axis = 1;
        }
        if size[2] > size[axis] {
            axis = 2;
        }
        let mid = aabb.min[axis] + size[axis] * 0.5;

        let range = &mut self.order[start..end];
        let mut left = 0;
        for i in 0..range.len() {
            if self.centroids[range[i] as usize][axis] < mid {
                range.swap(i, left);
                left += 1;
            }
        }

        if left == 0 || left == range.len() {
            left = range.len() / 2;
        }
        start + left
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A (n+1)² vertex grid of 2·n² triangles over a bumpy surface, laid out
    /// like a terrain chunk.
    fn grid(n: u32) -> (Vec<f32>, Vec<u32>) {
        let mut vertices = Vec::new();
        for z in 0..=n {
            for x in 0..=n {
                let y = ((x as f32) * 0.3).sin() * ((z as f32) * 0.2).cos() * 4.0;
                vertices.extend_from_slice(&[x as f32, y, z as f32]);
            }
        }
        let mut indices = Vec::new();
        let row = n + 1;
        for z in 0..n {
            for x in 0..n {
                let i = z * row + x;
                indices.extend_from_slice(&[i, i + row, i + 1, i + 1, i + row, i + row + 1]);
            }
        }
        (vertices, indices)
    }

    /// Unindexed triangles scattered in a cube. A tiny LCG keeps it stable.
    fn soup(tris: usize) -> Vec<f32> {
        let mut state = 12345u32;
        let mut next = || {
            state = state.wrapping_mul(1664525).wrapping_add(1013904223);
            (state >> 8) as f32 / (1u32 << 24) as f32 * 100.0
        };
        let mut vertices = Vec::new();
        for _ in 0..tris {
            let (cx, cy, cz) = (next(), next(), next());
            for _ in 0..3 {
                vertices.extend_from_slice(&[
                    cx + next() * 0.05,
                    cy + next() * 0.05,
                    cz + next() * 0.05,
                ]);
            }
        }
        vertices
    }

    fn contains(outer: &Node, inner: &[f32; 6]) -> bool {
        (0..3).all(|k| outer.min[k] <= inner[k] && inner[3 + k] <= outer.max[k])
    }

    fn tri_bounds(vertices: &[f32], tri: &[u32]) -> [f32; 6] {
        let mut b = [
            f32::INFINITY,
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        ];
        for &v in tri {
            for k in 0..3 {
                let c = vertices[v as usize * 3 + k];
                b[k] = b[k].min(c);
                b[3 + k] = b[3 + k].max(c);
            }
        }
        b
    }

    /// Checks everything a raycast relies on: the leaves cover every triangle
    /// exactly once, each node's bounds contain its triangles and children,
    /// and the leaf and depth limits hold.
    fn assert_valid(bvh: &Bvh, vertices: &[f32], original: &[u32], options: Options) {
        let tri_count = original.len() / 3;

        // Same triangles, reordered.
        let sorted = |tris: &[u32]| {
            let mut v: Vec<[u32; 3]> = tris.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect();
            v.sort();
            v
        };
        assert_eq!(sorted(&bvh.tri_indices), sorted(original));

        let mut covered = vec![0u32; tri_count];
        let mut visited = vec![false; bvh.nodes.len()];
        let mut stack = vec![(0usize, 0u32)];
        while let Some((i, depth)) = stack.pop() {
            assert!(!visited[i], "node {i} is reached twice");
            visited[i] = true;
            assert!(depth <= options.max_depth);
            let n = &bvh.nodes[i];

            if n.is_leaf() {
                let (first, count) = (n.first as usize, n.count as usize);
                for t in first..first + count {
                    covered[t] += 1;
                    let b = tri_bounds(vertices, &bvh.tri_indices[t * 3..t * 3 + 3]);
                    assert!(contains(n, &b), "leaf {i} does not contain triangle {t}");
                }
            } else {
                let right = n.first as usize;
                assert!(
                    right > i + 1,
                    "right child {right} of {i} is not after its left"
                );
                for child in [i + 1, right] {
                    let c = &bvh.nodes[child];
                    let (min, max) = (c.min, c.max);
                    assert!(contains(
                        n,
                        &[min[0], min[1], min[2], max[0], max[1], max[2]]
                    ));
                    stack.push((child, depth + 1));
                }
            }
        }
        assert!(visited.iter().all(|&v| v), "unreachable nodes");
        assert!(
            covered.iter().all(|&c| c == 1),
            "a triangle is not in exactly one leaf"
        );
    }

    #[test]
    fn builds_a_valid_tree_over_a_grid() {
        let (vertices, indices) = grid(40);
        for strategy in [Strategy::Sah, Strategy::Center] {
            let options = Options {
                strategy,
                ..Options::default()
            };
            let bvh = build(&vertices, Some(&indices), options);
            assert_valid(&bvh, &vertices, &indices, options);
            assert!(bvh.nodes.len() > 1);
        }
    }

    #[test]
    fn builds_a_valid_tree_over_unindexed_triangles() {
        let vertices = soup(500);
        let sequential: Vec<u32> = (0..(vertices.len() / 3) as u32).collect();
        for strategy in [Strategy::Sah, Strategy::Center] {
            let options = Options {
                strategy,
                ..Options::default()
            };
            let bvh = build(&vertices, None, options);
            assert_valid(&bvh, &vertices, &sequential, options);
        }
    }

    #[test]
    fn keeps_leaves_within_the_triangle_limit() {
        let (vertices, indices) = grid(30);
        let options = Options {
            max_leaf_triangles: 4,
            ..Options::default()
        };
        let bvh = build(&vertices, Some(&indices), options);
        for n in bvh.nodes.iter().filter(|n| n.is_leaf()) {
            assert!(n.count <= options.max_leaf_triangles);
        }
    }

    #[test]
    fn stops_at_the_depth_limit() {
        let (vertices, indices) = grid(30);
        let options = Options {
            max_depth: 3,
            ..Options::default()
        };
        let bvh = build(&vertices, Some(&indices), options);
        assert_valid(&bvh, &vertices, &indices, options);
        assert!(bvh.nodes.len() <= 15);
    }

    #[test]
    fn makes_one_leaf_when_triangles_cannot_be_separated() {
        // Every triangle is the same point, so no split separates any.
        let vertices = vec![1.0f32; 9 * 20];
        let bvh = build(&vertices, None, Options::default());
        assert_eq!(bvh.nodes.len(), 1);
        assert_eq!(bvh.nodes[0].count, 20);
    }

    #[test]
    fn handles_an_empty_mesh() {
        let bvh = build(&[], None, Options::default());
        assert_eq!(bvh.nodes.len(), 1);
        assert!(bvh.tri_indices.is_empty());
        assert!(bvh.nodes[0].is_leaf());
    }

    #[test]
    fn refit_matches_a_fresh_build_of_the_same_shape() {
        let (mut vertices, indices) = grid(30);
        let options = Options::default();
        let mut bvh = build(&vertices, Some(&indices), options);
        for v in vertices.chunks_exact_mut(3) {
            v[0] += v[1] * 0.5;
            v[1] = v[1] * 3.0 - 7.0;
        }
        refit(&mut bvh.nodes, &vertices, &bvh.tri_indices);
        assert_valid(&bvh, &vertices, &indices, options);

        // The root bounds every vertex.
        let mut all = Aabb::EMPTY;
        for v in vertices.chunks_exact(3) {
            all.grow(&Aabb {
                min: [v[0], v[1], v[2]],
                max: [v[0], v[1], v[2]],
            });
        }
        assert_eq!((bvh.nodes[0].min, bvh.nodes[0].max), (all.min, all.max));
    }

    #[test]
    fn reads_nodes_in_place_from_words() {
        let (vertices, indices) = grid(8);
        let bvh = build(&vertices, Some(&indices), Options::default());
        let mut words = bvh.node_words();
        assert_eq!(Node::from_words_mut(&mut words), &bvh.nodes[..]);
    }

    #[test]
    fn writes_each_node_as_its_words() {
        let (vertices, indices) = grid(8);
        let bvh = build(&vertices, Some(&indices), Options::default());
        let words = bvh.node_words();
        assert_eq!(std::mem::size_of::<Node>(), NODE_WORDS * 4);
        assert_eq!(words.len(), bvh.nodes.len() * NODE_WORDS);
        for (n, w) in bvh.nodes.iter().zip(words.chunks_exact(NODE_WORDS)) {
            assert_eq!(f32::from_bits(w[0]), n.min[0]);
            assert_eq!(f32::from_bits(w[5]), n.max[2]);
            assert_eq!((w[6], w[7]), (n.first, n.count));
        }
    }
}
