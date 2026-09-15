import { leafCells } from './atlas.ts';
import { createBuilder, finish, pushVertex, type ForgeMesh, type MeshAttributes } from './mesh.ts';
import type { Params } from './params.ts';
import { createRng, hash2, type Rng } from './rng.ts';
import { add, cross, normalize, rotateAbout, scale, type Vec3 } from './vec.ts';

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;
const UP: Vec3 = [0, 1, 0];

/** What the emitted layer is measured off, in place of a tree's skeleton. */
export interface ClumpMetrics {
  /** Metres to the topmost vertex. */
  height: number;
  /** Radius about the vertical axis, which is what the placer keeps clear. */
  spread: number;
  /** Metres the tuft bases are spread over. 0 for a single tuft. */
  patchRadius: number;
  tufts: number;
}

export interface Clump {
  mesh: ForgeMesh;
  metrics: ClumpMetrics;
}

/**
 * How far a card has turned away from upright at `t` along its own length.
 *
 * Lean and curve are separated because they are different shapes. Lean is
 * linear in `t`, so it opens the tuft evenly from the base. Curve is quadratic,
 * so it holds the blade straight low down and bends it over near the tip, which
 * is where a blade actually bends.
 */
function tiltAt(params: Params, t: number): number {
  return (params.cardLean * t + params.cardCurve * t * t) * DEG;
}

/**
 * How high a card's tip lands, as a fraction of the card's own length.
 *
 * Solved rather than measured, because it is what lets a card be cut to the
 * length that puts its tip exactly on `height`. The alternative — growing the
 * model and scaling it onto `height` afterwards — also rescales the patch
 * sideways, so `patchRadius` would stop meaning metres the moment `cardCurve`
 * moved.
 *
 * Floored, because past about 90 degrees of total turn a card curls back on
 * itself and the sum heads for zero.
 */
function heightFactor(params: Params): number {
  let sum = 0;
  for (let k = 1; k <= params.cardSegments; k++) sum += Math.cos(tiltAt(params, k / params.cardSegments));
  return Math.max(0.15, sum / params.cardSegments);
}

/**
 * The tuft's shading normal at a point: up, leaned outward by `normalLean`.
 *
 * Up is what keeps the tuft out of the wall-shading that makes grass read as
 * dark cardboard. The outward part is what stops the whole tuft shading as one
 * flat disc, and it costs contrast between the cards facing the sun and the
 * ones facing away — most under a low sun, so a lawn wants it at 0.
 */
function tuftNormal(params: Params, outward: Vec3): Vec3 {
  return normalize(add(scale(outward, params.normalLean), UP));
}

/**
 * Metres the tuft bases are spread over: what the config says, else enough
 * ground for the tufts asked for.
 *
 * The derivation is one tuft's own width times the square root of the count,
 * which is what keeps a patch's tufts about as far apart however many there
 * are. A patch that packs tighter as it grows reads as one solid mass.
 */
export function patchRadiusOf(params: Params): number {
  if (params.tuftsPerModel <= 1) return 0;
  if (params.patchRadius > 0) return params.patchRadius;
  return params.height * 1.2 * Math.sqrt(params.tuftsPerModel);
}

/**
 * Where each tuft of a patch stands, nearest the centre first.
 *
 * A jittered grid rather than a ring or a random scatter. A ring is a
 * constellation the eye locks onto after two or three instances, and a random
 * scatter leaves clots and holes at these counts. Taking the points nearest the
 * centre turns the square grid into a disc, which is also what puts the full
 * height tuft — index 0 — in the middle of the patch rather than on its rim.
 */
function patchOrigins(params: Params, rng: Rng): Vec3[] {
  const count = params.tuftsPerModel;
  if (count <= 1) return [[0, 0, 0]];

  const radius = patchRadiusOf(params);
  const side = Math.ceil(Math.sqrt(count));
  const cell = (2 * radius) / side;
  const points: Vec3[] = [];

  for (let gy = 0; gy < side; gy++)
    for (let gx = 0; gx < side; gx++)
      points.push([
        -radius + (gx + 0.5) * cell + rng.range(-0.34, 0.34) * cell,
        0,
        -radius + (gy + 0.5) * cell + rng.range(-0.34, 0.34) * cell,
      ]);

  points.sort((a, b) => a[0] * a[0] + a[2] * a[2] - (b[0] * b[0] + b[2] * b[2]));
  return points.slice(0, count);
}

/** One tuft's cards, written into the shared builder at `origin`. */
function buildTuft(
  params: Params,
  out: ReturnType<typeof createBuilder>,
  rng: Rng,
  cells: number,
  uvCells: ReturnType<typeof leafCells>,
  tuft: number,
  origin: Vec3,
  tuftYaw: number,
  tuftHeight: number
): void {
  const reach = tuftHeight / heightFactor(params);

  for (let card = 0; card < params.cardsPerTuft; card++) {
    // Spread by the golden angle and then jittered, for the reason the tree's
    // children are: an even fraction of a turn ties the azimuth to the index,
    // and five cards at 72 degrees read as a machined rosette. The per-tuft
    // offset is what stops every tuft of a patch being the same rosette.
    const yaw = tuftYaw + GOLDEN_ANGLE * card + rng.range(-0.35, 0.35);
    const outward: Vec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    // Horizontal, across the card. The card's own plane is spanned by this and
    // the direction it climbs in, so the card faces outward.
    const side = normalize(cross(UP, outward));

    // Card 0 is always full length, so the tuft lands exactly on the height it
    // was cut for. The rest fall short, so the tuft comes to a ragged top
    // rather than a flat one.
    const cardLength = reach * (card === 0 ? 1 : rng.range(0.55, 0.95));
    const halfWidth = (cardLength * heightFactor(params) * params.cardAspect) / 2;

    const base = add(origin, scale(outward, params.cardSpread * tuftHeight * rng.range(0.4, 1)));

    // One phase per card *per tuft*. A tree phases per limb because a limb
    // sways as one mass. A patch that phased per card alone would sway as one
    // rigid slab, which is far more obvious at three metres across than a
    // single stiff tuft ever was.
    const key = tuft * 131 + card;
    const phase = hash2(params.seed ^ 0x51ed270b, key);
    const cell = uvCells[Math.floor(hash2(params.seed, key * 977) * cells) % cells];

    // Walked rather than solved, so the card's length is its arc length and a
    // strongly curved blade does not come out short.
    let point = base;
    let direction = UP;
    const rowStart: number[] = [];

    for (let k = 0; k <= params.cardSegments; k++) {
      const t = k / params.cardSegments;

      if (k > 0) {
        const turn = tiltAt(params, t) - tiltAt(params, (k - 1) / params.cardSegments);
        direction = normalize(rotateAbout(direction, side, turn));
        point = add(point, scale(direction, cardLength / params.cardSegments));
      }

      const normal = tuftNormal(params, outward);
      const bend = t ** params.bendCurve;
      rowStart.push(out.positions.length / 3);

      for (const across of [-1, 1]) {
        pushVertex(
          out,
          add(point, scale(side, across * halfWidth)),
          normal,
          [cell.u0 + (across * 0.5 + 0.5) * (cell.u1 - cell.u0), cell.v1 - t * (cell.v1 - cell.v0)],
          // Flutter rises to the tip like the bend does, and is the blade's own
          // high-frequency motion rather than the tuft's sway.
          [bend, phase, t, 1]
        );
      }
    }

    // Wound so the card's front face is the one pointing outward. Both sides
    // draw anyway, since the piece is cutout, but a consistent winding is what
    // lets the preview's back-face test mean anything.
    for (let k = 0; k < params.cardSegments; k++) {
      const a = rowStart[k];
      const b = rowStart[k + 1];
      out.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
}

function buildBlades(params: Params, cells: number): MeshAttributes {
  const uvCells = leafCells(params.textureSize, gridFor(cells)).slice(0, cells);
  const rng = createRng(params.seed ^ 0x2d51f39b);
  const out = createBuilder();
  const origins = patchOrigins(params, rng);

  origins.forEach((origin, tuft) => {
    // Tuft 0 is full height and the rest stay under it, so `height` keeps
    // meaning the model's height however many tufts share it. They still vary,
    // or a patch reads as a row of clones whatever their yaw does.
    const tuftHeight = params.height * (tuft === 0 ? 1 : rng.range(0.62, 0.98));
    buildTuft(params, out, rng, cells, uvCells, tuft, origin, rng() * TWO_PI, tuftHeight);
  });

  return finish(out);
}

/** The grid a cell count is laid out on. Mirrors clumpAtlas in sources.ts. */
function gridFor(cells: number): number {
  return Math.ceil(Math.sqrt(cells));
}

/**
 * `cells` is how many of the atlas's cells were actually painted, from
 * `clumpAtlas` or the set's manifest. A card never addresses past it, because
 * a grid sized to hold ten stamps has six cells nothing drew.
 */
export function buildClump(params: Params, cells: number): Clump {
  const attributes = buildBlades(params, Math.max(1, cells));
  const positions = attributes.positions;

  let height = 0;
  let spread = 0;
  for (let i = 0; i < positions.length; i += 3) {
    height = Math.max(height, positions[i + 1]);
    spread = Math.max(spread, Math.hypot(positions[i], positions[i + 2]));
  }

  return {
    mesh: { pieces: [{ key: 'blade', attributes, cutout: true }] },
    metrics: { height, spread, patchRadius: patchRadiusOf(params), tufts: params.tuftsPerModel },
  };
}
