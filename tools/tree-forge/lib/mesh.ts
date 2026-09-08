// Skeleton to vertex attributes. Bark and leaves are built as two separate
// primitives because they want different materials: bark is opaque and single
// sided, leaves are alpha-tested and double sided, and those are per-material
// flags. One material would alpha-test the trunk for nothing.

import { atlasRegions, LEAF_VARIANTS } from './atlas.ts';
import type { Params } from './params.ts';
import { createRng, hash2 } from './rng.ts';
import { bendWeight, clusterPhase, sampleBranch, type BranchPoint, type Skeleton } from './skeleton.ts';
import { add, cross, normalize, perpendicular, rotateAbout, scale, sub, transport, type Vec3 } from './vec.ts';

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

export interface TreeMesh {
  bark: MeshAttributes;
  leaves: MeshAttributes;
}

/** Attributes while they are still growing, before they are frozen. */
interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export type Rgba = [number, number, number, number];

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function createBuilder(): Builder {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function pushVertex(
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

function finish(out: Builder): MeshAttributes {
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

function buildBark(params: Params, skeleton: Skeleton): MeshAttributes {
  const regions = atlasRegions(params.textureSize);
  const out = createBuilder();

  for (const branch of skeleton.branches) {
    const radial = Math.max(3, params.radialSegments - branch.level);
    const phase = clusterPhase(params, branch.clusterId);

    // A degenerate ring at the tip closes the tube. Without it every branch
    // ends in a hole that reads as a black speck through the canopy.
    const tip = branch.points[branch.points.length - 1];
    const rings: BranchPoint[] = [
      ...branch.points,
      { p: add(tip.p, scale(tip.dir, tip.radius * 2)), radius: tip.radius * 0.02, dist: tip.dist + tip.radius * 2, dir: tip.dir },
    ];

    let normal = perpendicular(rings[0].dir);
    let heading = rings[0].dir;
    const ringStart: number[] = [];

    // Length runs along u, the ring around v. v maps once into the bark band
    // on every branch, because that is what closes the ring seamlessly, so a
    // thin branch already wraps the whole texture round a fraction of the
    // trunk's girth. u has to shrink with it or the bark comes out squashed:
    // advancing by trunkRadius / radius makes a branch a scaled copy of the
    // trunk, and leaves the trunk base at --bark-tile metres per repeat.
    let u = rings[0].dist / params.barkTile;
    let previous: BranchPoint | null = null;

    for (const ring of rings) {
      normal = normalize(transport(normal, heading, ring.dir));
      heading = ring.dir;
      const binormal = cross(ring.dir, normal);

      const bend = bendWeight(params, skeleton, ring.dist);

      if (previous) {
        // Integrated per segment: scaling the whole path distance by the
        // local radius would let a taper rescale the length behind it too. The
        // segment's mean radius, so the degenerate cap ring stays bounded —
        // it shortens by the same factor it thins by.
        const radius = Math.max(1e-9, (previous.radius + ring.radius) * 0.5);
        u += ((ring.dist - previous.dist) * params.trunkRadius) / (radius * params.barkTile);
      }
      previous = ring;

      ringStart.push(out.positions.length / 3);

      for (let j = 0; j <= radial; j++) {
        const angle = (j / radial) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const offset: Vec3 = [
          normal[0] * cos + binormal[0] * sin,
          normal[1] * cos + binormal[1] * sin,
          normal[2] * cos + binormal[2] * sin,
        ];

        pushVertex(
          out,
          add(ring.p, scale(offset, ring.radius)),
          normalize(offset),
          [u, regions.bark.v0 + (j / radial) * (regions.bark.v1 - regions.bark.v0)],
          [bend, phase, 0, 1]
        );
      }
    }

    // Counter-clockwise seen from outside the tube, which is what glTF calls a
    // front face. The ring frame (normal, binormal, dir) is right handed, so
    // walking a quad ring-first winds it inward and the trunk draws inside out
    // under back-face culling.
    for (let i = 0; i < rings.length - 1; i++) {
      const a = ringStart[i];
      const b = ringStart[i + 1];
      for (let j = 0; j < radial; j++)
        out.indices.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
    }
  }

  return finish(out);
}

function leafNormal(mode: string, cardCentre: Vec3, cardNormal: Vec3, canopyCentre: Vec3): Vec3 {
  if (mode === 'up') return [0, 1, 0];
  if (mode === 'card') return cardNormal;

  // canopy: shade the crown as the rounded mass it reads as from a distance,
  // rather than as a pile of sideways-facing walls. A dome and not a full
  // sphere — half a crown hangs below its own centre, and a normal pointing
  // at the ground there takes bounce light only and reads as a hole. Lifting
  // the vertical half a turn leaves the rim facing out and the top facing up,
  // so the mass rounds off without an unlit underside.
  const outward = normalize(sub(cardCentre, canopyCentre));
  return normalize([outward[0], outward[1] * 0.5 + 0.5, outward[2]]);
}

function buildLeaves(params: Params, skeleton: Skeleton): MeshAttributes {
  const regions = atlasRegions(params.textureSize);
  const rng = createRng(params.seed ^ 0x1b873593);
  const out = createBuilder();

  for (const branch of skeleton.branches) {
    if (!branch.bearsLeaves) continue;
    const phase = clusterPhase(params, branch.clusterId);

    for (let k = 0; k < params.leavesPerBranch; k++) {
      const along = params.leafFrom + (1 - params.leafFrom) * ((k + 0.5) / params.leavesPerBranch);
      const at = sampleBranch(branch, Math.min(1, along + (rng() - 0.5) * 0.08));

      const right = normalize(rotateAbout(perpendicular(at.dir), at.dir, GOLDEN_ANGLE * k + rng() * 0.9));
      const leafDir = normalize(rotateAbout(at.dir, right, (params.leafDroop + (rng() - 0.5) * 20) * DEG));
      const cardNormal = normalize(cross(right, leafDir));

      const height = params.leafSize * rng.range(0.75, 1.25);
      const width = height * params.leafAspect;
      const stem = add(at.p, scale(right, at.radius));
      const cell = regions.leaves[Math.floor(hash2(params.seed, branch.id * 977 + k) * LEAF_VARIANTS) % LEAF_VARIANTS];

      const base = out.positions.length / 3;

      const corners: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];

      // One normal for the whole card. A card stands in for a cluster, not for
      // a curved surface, and taking the canopy direction per corner instead
      // swings it right across a card near the crown's centre.
      const normal = leafNormal(
        params.leafNormalMode,
        add(stem, scale(leafDir, height * 0.5)),
        cardNormal,
        skeleton.canopy.centre
      );

      for (const [uu, vv] of corners) {
        const corner = add(add(stem, scale(right, (uu - 0.5) * width)), scale(leafDir, vv * height));

        pushVertex(
          out,
          corner,
          normal,
          [cell.u0 + uu * (cell.u1 - cell.u0), cell.v1 - vv * (cell.v1 - cell.v0)],
          // Flutter is the leaf's own high-frequency motion, so it starts at
          // zero where the card is pinned to the branch.
          [bendWeight(params, skeleton, at.dist + vv * height), phase, vv, 1]
        );
      }

      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  return finish(out);
}

export function buildMesh(params: Params, skeleton: Skeleton): TreeMesh {
  return { bark: buildBark(params, skeleton), leaves: buildLeaves(params, skeleton) };
}

export function boundsOf(positions: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3)
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }

  return { min, max };
}
