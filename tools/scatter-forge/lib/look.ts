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
  /** Base bark colour, six digit hex. The generated wood is three shades of
   *  it: the crevice, the mid tone and the face that catches the light. */
  barkTint: '#6b5541',
  /** Base leaf colour, six digit hex. */
  leafTint: '#4e7c33',
  /**
   * Base blade colour for a generated clump, six digit hex.
   *
   * Its own value rather than the leaf's, and lighter and more olive than it.
   * A tuft is read against the ground it stands on rather than against the sky,
   * so a canopy green reads as a dark blob on dry terrain while the same green
   * high in a crown reads as foliage. This sits close enough to a dry sward
   * that the gaps between tufts stop registering as holes.
   */
  bladeTint: '#7d8f4a',
  /**
   * Base frond colour for a generated crown, six digit hex. Between the two
   * above: a rosette is read against the sky like a canopy, but a frond is
   * one leaf and lighter than a cluster's shadowed mass.
   */
  frondTint: '#5c8a3c',
  /** Colour patches around the tube. Fewer means broader blotches. */
  colourPatches: 5,
  /** How far colour drifts along the warm-to-cool axis. */
  colourVariation: 0.18,
  /** Low frequency variation in the roughness channel. */
  roughnessVariation: 0.13,
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
