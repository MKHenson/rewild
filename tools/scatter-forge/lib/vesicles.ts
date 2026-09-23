// Vesicles: the gas holes a lava froze around.
//
// A vesicle is a bubble, so it is a sphere in 3D and not a spot on the
// surface. The surface cuts each sphere at its own height, and this is why the
// holes on a broken face are many sizes even where the bubbles were one: a
// sphere cut near its middle shows wide, and one cut near its top shows as a
// pin prick.
//
// The bubbles sit on a jittered 3D lattice, one at most per cell, and a share
// of the cells hold one. Three octaves of lattice stack, each finer than the
// last, so a face shows a few large holes among many small ones. Lava flow
// pulls the bubbles into ovals, so the lattice is stretched along one axis of
// the bedding frame. A slow noise across the bedding groups them into zones,
// the way a flow is frothy at its top and dense at its core.
//
// Some holes later fill with minerals. Such a hole is an amygdale: a pale spot
// flush with the stone, with no depth.

import { fbm3r, hash3, smoothstep } from './noise.ts';

/** One lattice of bubbles, all of about one size. */
export interface VesicleOctave {
  /** Lattice cells per metre. */
  cells: number;
  /** Share of the cells that hold a bubble, 0..1. */
  share: number;
  /** How much of a pit at this size the mesh can carry, 0..1. The texture draws the rest. */
  carry: number;
}

export interface VesicleField {
  /** Largest first. */
  octaves: VesicleOctave[];
  /** How far a bubble's radius varies below the largest a cell can hold, 0..1. */
  vary: number;
  /** How far the lattice is drawn out along the flow, as a multiple: 1 is round. */
  stretch: number;
  /** How far the bubbles are grouped into zones, 0..1. 0 spreads them evenly. */
  zoning: number;
  /** How deep a pit reaches, as a fraction of its own radius. */
  depth: number;
  /** Share of the bubbles filled with minerals, 0..1. */
  amygdales: number;
  /** Row-major rotation taking world space into the bedding frame. The flow runs along its x. */
  frame: number[];
  seed: number;
}

export interface VesicleSample {
  /** 1 inside a hole's outline, 0 clear of one, with a texel of softness at its edge. */
  cover: number;
  /** The bowl under the outline: 1 at a hole's deepest point, 0 at its lip. 0 in a filled hole. */
  pit: number;
  /** The hole's radius over the largest octave's, 0..1, so a small pit is shallow in the height map too. */
  scale: number;
  /** 1 where the hole is filled with minerals. */
  filled: number;
  /** The bubble's own random value, 0..1. */
  id: number;
  /** Metres the mesh is cut in by the pits it can carry. */
  cut: number;
}

/** Each octave's bubbles are this much smaller than the octave above. */
export const VESICLE_STEP = 2.3;
export const VESICLE_OCTAVES = 3;

/**
 * The largest radius a bubble takes, as a fraction of its cell, and how far its
 * centre strays from the cell's. The two together keep a bubble inside the
 * cells next to its own, which is what lets the search stop at them.
 */
const RADIUS = 0.42;
const JITTER = 0.28;

/** Cycles per metre of the zoning noise, and how far it is flattened into bands along the bedding. */
const ZONE_SCALE = 1.1;
const ZONE_BANDING = 2.5;

/** The field a config asks for, or null for a rock with no holes. */
export function vesicleFieldOf(
  params: {
    vesicles: number;
    vesicleSize: number;
    vesicleVary: number;
    vesicleStretch: number;
    vesicleZoning: number;
    vesicleDepth: number;
    amygdales: number;
    seed: number;
  },
  frame: number[],
  carries: (size: number) => number
): VesicleField | null {
  if (params.vesicles <= 0) return null;

  const octaves: VesicleOctave[] = [];
  for (let k = 0; k < VESICLE_OCTAVES; k++) {
    const diameter = params.vesicleSize / VESICLE_STEP ** k;
    // A cell holds a bubble a little under its own size, so the cell edge is
    // the diameter over the share of it the largest bubble fills.
    const cells = (2 * RADIUS) / diameter;
    // The finer octaves are where the spread in size comes from: with no
    // spread, every hole is from the largest.
    const share = params.vesicles * (k === 0 ? 1 : params.vesicleVary * (0.6 + 0.4 * k));
    if (share <= 0) continue;
    octaves.push({ cells, share: Math.min(0.95, share), carry: carries(diameter) });
  }

  return {
    octaves,
    vary: params.vesicleVary,
    stretch: 1 + 2 * params.vesicleStretch,
    zoning: params.vesicleZoning,
    depth: params.vesicleDepth,
    amygdales: params.amygdales,
    frame,
    seed: params.seed ^ 0x76657369,
  };
}

/** True if any octave is coarse enough for the mesh to cut. */
export function meshCuts(field: VesicleField): boolean {
  return field.depth > 0 && field.octaves.some((octave) => octave.carry > 0);
}

/**
 * The holes at a point, written into `into`.
 *
 * `meshOnly` reads just the octaves the mesh can carry, and is the fast path
 * `shape` takes for a vertex. The texture reads every octave.
 */
export function vesicleInto(into: VesicleSample, field: VesicleField, x: number, y: number, z: number, meshOnly: boolean): VesicleSample {
  into.cover = 0;
  into.pit = 0;
  into.scale = 0;
  into.filled = 0;
  into.id = 0;
  into.cut = 0;

  const f = field.frame;
  // Into the bedding frame, with the flow axis squeezed so a cell, and the
  // bubble in it, is drawn out along the flow.
  const qx = (f[0] * x + f[1] * y + f[2] * z) / field.stretch;
  const qy = f[3] * x + f[4] * y + f[5] * z;
  const qz = f[6] * x + f[7] * y + f[8] * z;

  // The zones shrink the bubbles rather than thin them out, so a zone's margin
  // is a fade to pin pricks and never a hole cut in half.
  let zone = 1;
  if (field.zoning > 0) {
    const n = fbm3r(qx * ZONE_SCALE, qy * ZONE_SCALE * ZONE_BANDING, qz * ZONE_SCALE, 3, field.seed ^ 0x7a6f6e65);
    zone = 1 - field.zoning * (1 - smoothstep(0.38, 0.6, n));
    if (zone <= 0) return into;
  }

  const largest = field.octaves[0].cells;

  for (let k = 0; k < field.octaves.length; k++) {
    const octave = field.octaves[k];
    if (meshOnly && octave.carry <= 0) continue;
    const seed = field.seed ^ (0x9e3779b9 * (k + 1));
    const c = octave.cells;
    const fx = qx * c;
    const fy = qy * c;
    const fz = qz * c;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const cz = Math.floor(fz);

    for (let oz = -1; oz <= 1; oz++)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const gz = cz + oz;

          // Most cells hold no bubble, so the cheap draw gates the rest.
          const id = hash3(gx, gy, gz, seed ^ 0x51ed270b);
          if (id > octave.share) continue;

          const radius = RADIUS * zone * (1 - field.vary * 0.6 * hash3(gx, gy, gz, seed ^ 0x2545f491));
          const dx = fx - (gx + 0.5 + (hash3(gx, gy, gz, seed) - 0.5) * 2 * JITTER);
          const dy = fy - (gy + 0.5 + (hash3(gx, gy, gz, seed ^ 0x165667b1) - 0.5) * 2 * JITTER);
          const dz = fz - (gz + 0.5 + (hash3(gx, gy, gz, seed ^ 0x3c6ef372) - 0.5) * 2 * JITTER);
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= radius * radius) continue;

          const t = Math.sqrt(d2) / radius;
          const cover = 1 - smoothstep(0.86, 1, t);
          const scale = (radius / RADIUS) * (largest / c);
          const filled = hash3(gx, gy, gz, seed ^ 0x7f4a7c15) < field.amygdales ? 1 : 0;
          const pit = filled ? 0 : Math.sqrt(1 - t * t);

          // A bubble inside a larger one is the same hole. The deeper pit wins,
          // so a small hole never lifts the floor of a large one.
          if (pit * scale > into.pit * into.scale || (into.pit === 0 && cover > into.cover)) {
            into.pit = pit;
            into.scale = scale;
            into.filled = filled;
            into.id = id / octave.share;
          }
          into.cover = Math.max(into.cover, cover);
          if (!filled && octave.carry > 0) {
            // The pit in metres: the bowl times the bubble's own radius.
            const cut = (pit * radius * field.depth * octave.carry) / c;
            if (cut > into.cut) into.cut = cut;
          }
        }
  }

  return into;
}
