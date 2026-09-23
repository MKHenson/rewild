// Skeleton to vertex attributes. Bark and leaves are built as two separate
// primitives because they want different materials: bark is opaque and single
// sided, leaves are alpha-tested and double sided, and those are per-material
// flags. One material would alpha-test the trunk for nothing.
//
// A model is a list of pieces rather than a fixed bark-and-leaves pair, because
// a piece is what everything downstream is keyed on: one texture set, one glTF
// material, one draw. A tree ships two, a clump ships one, and a rock will ship
// one. The shared builder below is what every type writes its vertices through.

import { accentRng, buildAccent, cardsAt, type AccentSite } from './accents.ts';
import { accentCells, leafCells, type AtlasLayout } from './atlas.ts';
import { createBuilder, finish, pushVertex, type Builder, type MeshAttributes, type Rgba } from './builder.ts';
import { signedFbm, smoothstep } from './noise.ts';
import { trunkSidesOf, type AccentSpec, type Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import { bendWeight, clusterPhase, sampleBranch, type BranchPoint, type Skeleton } from './skeleton.ts';
import { add, cross, normalize, perpendicular, rotateAbout, scale, sub, transport, type Vec3 } from './vec.ts';

export { createBuilder, finish, pushVertex, type Builder, type MeshAttributes, type Rgba };

/**
 * One primitive of a model: its vertices, and how they are drawn.
 *
 * `key` is the single name the piece is known by end to end — its texture
 * files (`<set>_<key>_diff.webp`), its glTF material, its materials.json
 * block and its preview panel. Nothing maps one spelling to another.
 */
export interface Piece {
  key: string;
  attributes: MeshAttributes;
  /**
   * Alpha tested and double sided. Cutout foliage is both: the test cuts the
   * leaf shape out of a rectangle, and you see a leaf from underneath. Bark is
   * neither, and a trunk seen from inside is a bug.
   */
  cutout: boolean;
}

/** A finished model: everything a glTF, a preview and a triangle count need. */
export interface ForgeMesh {
  pieces: Piece[];
}

/** One piece by key. Throws rather than returning undefined, because a caller
 *  asking for a piece a type does not ship is a mistake, not a branch. */
export function pieceOf(mesh: ForgeMesh, key: string): MeshAttributes {
  const piece = mesh.pieces.find((entry) => entry.key === key);
  if (!piece) throw new Error(`This model has no '${key}' piece. It ships ${mesh.pieces.map((p) => p.key).join(', ')}.`);
  return piece.attributes;
}

export function totalTriangles(mesh: ForgeMesh): number {
  return mesh.pieces.reduce((sum, piece) => sum + piece.attributes.triangleCount, 0);
}

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;

/** Flutes cut around the trunk. A whole number, or the last one fails to meet
 *  the first and there is a seam up the trunk. Five is four sides of a
 *  20-sided ring per flute, which is the coarsest that still reads as a fold
 *  rather than as a facet. */
export const TRUNK_FLUTES = 5;

/** Cells of the sway field up the trunk. Low, so a flute runs with the grain
 *  and wanders over the whole height instead of knotting every metre. */
const TRUNK_FLUTE_RISE = 2;

/**
 * The trunk's surface radius at one angle and one height, as a multiple of the
 * radius the skeleton carries there. Exactly 1 on a tree that sets neither key,
 * which is what keeps a plain trunk the tube it always was.
 *
 * Two layers over the taper. `trunkFlare` swells the foot and is gone by a
 * quarter of the way up, on the curve `lib/crown.ts` already gives a palm's
 * stem. `trunkFlute` cuts the grooves: narrow creases at the zero crossings of
 * a field that varies fast around the trunk and slowly up it, so they run
 * vertically and wander as they climb. They fade out under the crown, where a
 * trunk is one season's growth and smooth.
 *
 * It cuts in rather than swelling out, so a fluted trunk still measures
 * `trunkRadius` across its faces and the tree does not quietly get fatter.
 */
function trunkProfile(params: Params, angle: number, height: number): number {
  // Gone by a fifth of the way up. A palm's stem uses a quarter of its own
  // height for this and a stem is seven metres; a trunk is forty, and a quarter
  // of that is a cone rather than a foot.
  //
  // A crown's stem carries its foot in its own radius, on its own curve, so the
  // flare belongs to the trunk here and a stem takes the flutes alone. Adding
  // it twice squares the swelling.
  const flare = params.type === 'crown' ? 0 : params.trunkFlare * (1 - smoothstep(0, 0.2, height));
  if (params.trunkFlute <= 0) return 1 + flare;

  const turn = angle / TWO_PI;

  // A cosine of the angle, not a noise field read straight. A flute has to be
  // there at every height and at its full depth, and one ring is a slice
  // through a field that reaches its extremes only here and there: sampled
  // that way `trunkFlute` 0.16 cut 6% and the trunk came out round.
  //
  // So the count is exact and the noise only sways it, which also makes the key
  // mean what it says. Both terms stay periodic around the trunk: the phase
  // advances by a whole number of flutes per turn and the sway wraps with it,
  // so the last flute meets the first.
  const sway = signedFbm(turn * 2, height * TRUNK_FLUTE_RISE, 2, TRUNK_FLUTE_RISE, 2, params.seed ^ 0x2f9c1b7d) * 0.4;
  const ripple = Math.cos((turn * TRUNK_FLUTES + sway) * TWO_PI);

  // The broad hollow, plus the groove line at the bottom of it. The hollow
  // alone reads as melted wax, and the groove alone falls between the sides.
  const hollow = 0.5 - 0.5 * ripple;
  const groove = smoothstep(-0.55, -1, ripple);

  // No two flutes the same depth. Constant up the trunk, because how deep a
  // flute is belongs to the flute; read mid-cell of a 2-period axis, because a
  // period of 1 makes the lattice's two rows the same row and the field
  // collapses to its mean.
  const depth =
    0.55 + 0.45 * (0.5 + 0.5 * signedFbm(turn * TRUNK_FLUTES, 0.5, TRUNK_FLUTES, 2, 1, params.seed ^ 0x45d9f3b3));

  const fade = 1 - smoothstep(0.45, 0.95, height);
  return 1 + flare - params.trunkFlute * depth * (0.72 * hollow + 0.28 * groove) * fade;
}

/**
 * The normal of that surface, from the derivatives of the profile rather than
 * from the radial direction.
 *
 * A shaped trunk is no longer a cylinder, so its normal is no longer the way
 * the vertex points. Leaving it radial lights every groove wall as if it faced
 * outward, and a groove that does not shade is a groove you cannot see: the
 * silhouette gains flutes and the lit face stays a smooth pole.
 */
function trunkNormal(
  params: Params,
  angle: number,
  height: number,
  frame: { radial: Vec3; tangential: Vec3; axis: Vec3 },
  radius: number,
  axisLength: number
): Vec3 {
  const step = 1e-3;
  const dAngle =
    ((trunkProfile(params, angle + step, height) - trunkProfile(params, angle - step, height)) / (2 * step)) * radius;
  const dHeight =
    ((trunkProfile(params, angle, height + step) - trunkProfile(params, angle, height - step)) / (2 * step)) * radius;

  // dP/dangle and dP/dheight in the ring's own frame. Crossed in that order
  // they point outward, because (radial, tangential, axis) is right handed.
  const around = add(scale(frame.radial, dAngle), scale(frame.tangential, radius));
  const along = add(scale(frame.axis, axisLength), scale(frame.radial, dHeight));

  return normalize(cross(around, along));
}

/**
 * An authored bark tile's size in the world, which is what the UVs repeat it by.
 *
 * Null where the bark is generated: that pattern has no size of its own, so it
 * wraps exactly once around every branch whatever the branch measures, and a
 * twig comes out a scaled copy of the trunk.
 */
export interface BarkTile {
  /** Metres of branch one tile covers around the ring. */
  metresAround: number;
  /** Its shape, height over width. One tile is `metresAround * aspect` long. */
  aspect: number;
}

/** The bark tubes of every branch up to `barkLevels`. A crown's stem is one
 *  branch on a skeleton of its own, and goes through here unchanged. */
export function buildBark(params: Params, skeleton: Skeleton, bark: BarkTile | null = null): MeshAttributes {
  const out = createBuilder();

  for (const branch of skeleton.branches) {
    // A twig under the canopy is never seen from the distance a coarse tier
    // draws at, and twigs are most of the bark.
    if (branch.level > params.barkLevels) continue;

    // The trunk is one branch of hundreds and most of what a tree is seen by,
    // so it takes its own side count. Everything below it thins with depth.
    const radial =
      branch.level === 0 ? trunkSidesOf(params) : Math.max(3, params.radialSegments - branch.level);
    const phase = clusterPhase(params, branch.clusterId);

    // Whether this branch's rings are shaped rather than round. The trunk
    // alone, and only when it was asked for: a tree that sets neither key
    // builds exactly the tube it built before these existed.
    const shaped =
      branch.level === 0 && (params.trunkFlute > 0 || (params.type !== 'crown' && params.trunkFlare > 0));

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
    // Rings per unit of the height the profile is read against, which is what
    // turns its slope into a real one along the trunk.
    const lastPoint = branch.points.length - 1;

    // How many times the image wraps this branch.
    //
    // An authored tile knows how much trunk it covers, so a thick branch shows
    // several of it and a twig shows one — its bark keeps the size it was
    // photographed at. A generated one has no such size and always wraps once.
    // Whole turns either way, or the seam where the ring closes would land
    // mid-image.
    const circumference = TWO_PI * branch.baseRadius;
    const turns = bark ? Math.max(1, Math.round(circumference / bark.metresAround)) : 1;
    const aspect = bark ? bark.aspect : params.barkAspect;

    // Length runs down the image and the ring across it, matching the way bark
    // is authored. Both axes wrap, so length tiles for free at any branch
    // length and the ring closes on itself.
    //
    // The ring maps once across the image whatever the branch, because that is
    // what closes it seamlessly — so the image width always covers exactly one
    // circumference. Advancing length by the same circumference makes the
    // texture square in world space on every branch, at every radius, with no
    // reference length to author and nothing to drift out of step. It is also
    // what keeps a twig a scaled copy of the trunk rather than a squashed one.
    // Metres of branch one tile covers along it. The image is `aspect` times
    // taller than the strip of ring it wraps, so it is that many times longer
    // than the strip is wide — which is what turns texels into distance before
    // the same bark comes round again.
    const tileAlong = (circumference / turns) * aspect;
    let along = rings[0].dist / tileAlong;
    let previous: BranchPoint | null = null;

    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      // The degenerate cap ring is past the top of the profile and has no
      // radius left to shape, so it stays round.
      const shapedRing = shaped && i <= lastPoint;
      const height = lastPoint > 0 ? Math.min(1, i / lastPoint) : 0;

      normal = normalize(transport(normal, heading, ring.dir));
      heading = ring.dir;
      const binormal = cross(ring.dir, normal);

      const bend = bendWeight(params, skeleton, ring.dist);

      if (previous) {
        // Integrated per segment: dividing the whole path distance by the local
        // radius would let a taper rescale the length behind it too. The
        // segment's mean radius, so the degenerate cap ring stays bounded — it
        // shortens by the same factor it thins by.
        const radius = Math.max(1e-9, (previous.radius + ring.radius) * 0.5);
        // Integrated against the local radius so a taper cannot rescale the
        // length behind it, and against this branch's own turn count so the
        // tile stays undistorted at any thickness.
        along += ((ring.dist - previous.dist) * turns) / (TWO_PI * radius * aspect);
      }
      previous = ring;

      ringStart.push(out.positions.length / 3);

      for (let j = 0; j <= radial; j++) {
        const angle = (j / radial) * Math.PI * 2;
        const u = (j / radial) * turns;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const offset: Vec3 = [
          normal[0] * cos + binormal[0] * sin,
          normal[1] * cos + binormal[1] * sin,
          normal[2] * cos + binormal[2] * sin,
        ];

        const radius = shapedRing ? ring.radius * trunkProfile(params, angle, height) : ring.radius;

        pushVertex(
          out,
          add(ring.p, scale(offset, radius)),
          shapedRing
            ? trunkNormal(
                params,
                angle,
                height,
                {
                  radial: offset,
                  tangential: [
                    normal[0] * -sin + binormal[0] * cos,
                    normal[1] * -sin + binormal[1] * cos,
                    normal[2] * -sin + binormal[2] * cos,
                  ],
                  axis: ring.dir,
                },
                ring.radius,
                branch.length
              )
            : normalize(offset),
          [u, along],
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

/**
 * Where a tree's accent may hang. Twigs are the leaf-bearing branches, sampled
 * over the same stretch the leaves fill, so fruit and leaves share their
 * shoots. Forks are the points children leave their parents, on every
 * generation, with the parent's radius there — where heavy fruit hangs.
 *
 * The phase is the limb's, so a card swings with what it hangs from.
 */
function treeSites(params: Params, skeleton: Skeleton, spec: AccentSpec, rng: Rng): AccentSite[] {
  const sites: AccentSite[] = [];

  if (spec.attach === 'forks') {
    for (const parent of skeleton.branches)
      for (const childId of parent.children) {
        const child = skeleton.branches[childId];
        const at = child.points[0];
        const cards = cardsAt(spec.count, rng);
        for (let n = 0; n < cards; n++)
          sites.push({
            p: at.p,
            radius: at.radius / params.radiusRatio,
            dist: at.dist,
            phase: clusterPhase(params, parent.clusterId),
            key: child.id * 64 + n,
          });
      }
    return sites;
  }

  for (const branch of skeleton.branches) {
    if (!branch.bearsLeaves) continue;
    const cards = cardsAt(spec.count, rng);
    for (let n = 0; n < cards; n++) {
      const at = sampleBranch(branch, params.leafFrom + (1 - params.leafFrom) * rng());
      sites.push({ p: at.p, radius: at.radius, dist: at.dist, phase: clusterPhase(params, branch.clusterId), key: branch.id * 64 + n });
    }
  }
  return sites;
}

function buildLeaves(params: Params, skeleton: Skeleton, atlas: AtlasLayout): MeshAttributes {
  const cells = leafCells(params.textureSize, atlas.grid).slice(0, atlas.cells);
  const variants = cells.length;
  const rng = createRng(params.seed ^ 0x1b873593);
  const out = createBuilder();

  for (const branch of skeleton.branches) {
    if (!branch.bearsLeaves) continue;
    const phase = clusterPhase(params, branch.clusterId);

    for (let k = 0; k < params.leavesPerBranch; k++) {
      const along = params.leafFrom + (1 - params.leafFrom) * ((k + 0.5) / params.leavesPerBranch);
      const at = sampleBranch(branch, Math.min(1, along + (rng() - 0.5) * 0.08));

      const right = normalize(rotateAbout(perpendicular(at.dir), at.dir, GOLDEN_ANGLE * k + rng() * 0.9));
      const leafDir = normalize(rotateAbout(at.dir, right, (params.leafAngle + (rng() - 0.5) * 20) * DEG));
      const cardNormal = normalize(cross(right, leafDir));

      const height = params.leafSize * params.leafScale * rng.range(0.75, 1.25);
      const width = height * params.leafAspect;
      const stem = add(at.p, scale(right, at.radius));
      const cell = cells[Math.floor(hash2(params.seed, branch.id * 977 + k) * variants) % variants];
      const leafPhase = hash2(params.seed ^ 0x2545f491, branch.id * 977 + k);

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
          // zero where the card is pinned to the branch. The tip corners are
          // jittered apart so a card twists rather than rocking as a rigid
          // hinge, and the leaf's own phase in A stops every card on a limb
          // fluttering in step.
          [
            bendWeight(params, skeleton, at.dist + vv * height),
            phase,
            vv * rng.range(0.6, 1),
            leafPhase,
          ]
        );
      }

      out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Into the same piece, after the leaves: an accent is more cutout on the
  // leaf material, addressing the cells set aside past the leaf grid.
  params.accents.forEach((spec, index) =>
    buildAccent(out, params, index, spec, treeSites(params, skeleton, spec, accentRng(params, index)), accentCells(params.textureSize, atlas, index), {
      bend: (site, along) => bendWeight(params, skeleton, site.dist + along),
      normal: (site, _outward, face) => leafNormal(params.leafNormalMode, site.p, face, skeleton.canopy.centre),
    })
  );

  return finish(out);
}

/** `atlas` is how the leaf image was cut, from the sources or the set's
 *  manifest, so a card never addresses a cell nothing drew. */
export function buildMesh(
  params: Params,
  skeleton: Skeleton,
  atlas: AtlasLayout,
  bark: BarkTile | null = null
): ForgeMesh {
  return {
    pieces: [
      { key: 'bark', attributes: buildBark(params, skeleton, bark), cutout: false },
      { key: 'leaf', attributes: buildLeaves(params, skeleton, atlas), cutout: true },
    ],
  };
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
