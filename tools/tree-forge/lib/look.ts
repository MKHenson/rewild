// How the generated bark and leaves look.
//
// Fixed, not flags. These were tuning knobs while the generator was the only
// way to get a texture; they are settled now, and the way to change how bark
// looks is to author a source rather than to reach for a number. Removing them
// from the input surface takes twenty rows out of --help, twenty keys out of
// every tree.json, and the whole tuning section out of the README.
//
// They are still fields on Params, so nothing downstream changed and a test can
// still vary one directly to prove what it does.

export const LOOK = {
  /** Base bark colour, six digit hex. */
  barkTint: '#6b5541',
  /** Base leaf colour, six digit hex. */
  leafTint: '#4e7c33',
  /** Bark plates around the tube. Fewer means broader slabs. */
  barkPlates: 18,
  /** How far bark plates sit above and below each other. */
  barkStep: 0.13,
  /** Flaking on the exposed faces. */
  barkCrust: 0.13,
  /** How far a fissure wanders sideways, scaling what the profile sets. */
  grooveWander: 1,
  /** How often a knot appears, 0..1, over a fixed grid of bark cells. */
  knots: 0.12,
  /** Knot radius as a fraction of a bark cell. */
  knotSize: 0.26,
  /** How strongly a knot deforms the bark around it, 0..1. */
  knotDepth: 0.75,
  /** Half-width of a fissure, as a fraction of a cell's height. */
  grooveWidth: 0.26,
  /** How far a fissure cuts where it runs along the trunk. */
  grooveDepth: 0.72,
  /** Colour at the bottom of a fissure, as a fraction of the plate colour. */
  grooveShade: 0.32,
  /** Colour patches around the tube. Fewer means broader blotches. */
  colourPatches: 5,
  /** How far colour drifts along the warm-to-cool axis. */
  colourVariation: 0.18,
  /** Low frequency variation in the roughness channel. */
  roughnessVariation: 0.13,
  /** Lichen coverage on the bark, 0..1. */
  lichen: 0.3,
  /** Lichen colour, six digit hex. */
  lichenTint: '#93a17a',
  /** How much curvature darkens crevices and bleaches ridges. */
  curvature: 0.55,
  /** How far a leaflet edge is eaten into lobes. */
  leafSerration: 0.32,
  /** Gradient gain turning the height template into a normal map. */
  bumpStrength: 2.2,
} as const;

/**
 * Keys that used to exist, and why they do not.
 *
 * A `tree.json` written before one was retired still opens and drops it on the
 * next save, so nothing on disk is stranded.
 */
export const RETIRED: Record<string, string> = {
  ...Object.fromEntries(
    Object.keys(LOOK).map((key) => [key, 'how the bark and leaves look is settled in lib/look.ts'])
  ),
  barkTile: 'bark is scaled by the branch it is on, so there is nothing left to set',
  config: 'the file is the config; there is no option that names another one',
  watch: 'a command line switch, not a property of the tree',
};

export function retiredKeys(): string[] {
  return Object.keys(RETIRED);
}
