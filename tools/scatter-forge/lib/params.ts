// The generator's whole input surface: the keys of a tree.json. The resolved
// set is written next to the model as its sidecar, so a variant can be
// regenerated or nudged from the file that made it.

import type { ScatterImpostor } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { LOOK, retiredKeys } from './look.ts';
import { FORGE_TYPES, isForgeType, type ForgeType } from './pieces.ts';
import { hashString } from './rng.ts';

type Default = string | number | boolean | readonly string[] | readonly LodTier[] | readonly AccentSpec[] | ScatterImpostor | null;

interface ParamSpec {
  readonly type: 'string' | 'number' | 'int' | 'flag' | 'list' | 'tiers' | 'impostor' | 'accents';
  readonly default: Default;
  readonly help: string;
  /** Changing this changes the texture files, for every type or for the ones
   *  listed. Everything else only moves the mesh, which costs a thousandth as
   *  much to rebuild. */
  readonly texture?: boolean | readonly ForgeType[];
  /**
   * The model types this key applies to. Absent means every type.
   *
   * Setting a key its type does not use is an error that names the type that
   * does, for the same reason an unknown key is one: a silently dropped option
   * is a change that appears not to have worked.
   */
  readonly types?: readonly ForgeType[];
  /**
   * What this key defaults to per type, where one default does not suit them
   * all. A tree culls at 160m and a tuft of grass at 50m, and neither number
   * is a sensible fallback for the other.
   */
  readonly byType?: Partial<Record<ForgeType, Default>>;
  /**
   * For a type this key does not apply to, the key that type takes instead.
   *
   * Named in the error, because "this belongs to another type" leaves the
   * reader to go and find what their own type calls it.
   */
  readonly insteadFor?: Partial<Record<ForgeType, string>>;
}

const TREE = ['tree'] as const;
const CLUMP = ['clump'] as const;
const CROWN = ['crown'] as const;
const PEBBLE = ['pebble'] as const;
/** The types grown from a 3D field: one stone, or a cluster of them. */
const STONE = ['rock', 'pebble'] as const;
/** The types that grow a bark tube. */
const WOODY = ['tree', 'crown'] as const;
/** The types whose cutout is a segmented card. */
const CARDED = ['clump', 'crown'] as const;
/** The types whose `height` is a finished height. A crown is two lengths instead. */
const SIZED = ['tree', 'clump', 'rock', 'pebble'] as const;
/** The types that ship a cutout piece, and so read the wind and the foliage keys. */
const LEAFY = ['tree', 'clump', 'crown'] as const;
/** The types that coarsen with distance rather than culling. */
const TIERED = ['tree', 'crown', 'rock', 'pebble'] as const;

/**
 * One coarser mesh tier. The skeleton is the model's own, so the silhouette
 * holds across the chain; only what is hung on it gets cheaper.
 */
export interface LodTier {
  /** Metres at which this tier takes over from the one before it. */
  distance: number;
  radialSegments?: number;
  trunkSides?: number;
  barkLevels?: number;
  leavesPerBranch?: number;
  leafScale?: number;
  cardSegments?: number;
  subdivisions?: number;
}

/** The keys a tier may override, all of them mesh-only. A tier takes only
 *  those its own type reads, checked the way any other key is. */
export const LOD_OVERRIDES = [
  'radialSegments',
  'trunkSides',
  'barkLevels',
  'leavesPerBranch',
  'leafScale',
  'cardSegments',
  'subdivisions',
] as const;

/** Where a tree hangs an accent: along its leaf twigs, or at the points its branches fork. */
export const ACCENT_ATTACH = ['twigs', 'forks'] as const;

export type AccentAttach = (typeof ACCENT_ATTACH)[number];

/**
 * One accent: a population of cards hung plumb off the model, sourced from
 * their own stamps and sharing the cutout's atlas. A fern's spire, a poplar's
 * catkins and a palm's skirt of dead fronds are one of these each, and the
 * only thing that tells them apart is `pitch`.
 */
export interface AccentSpec {
  /** Folders under sources/accents, as folder or folder/pattern. */
  stamps: string[];
  /** Cards per site. A fraction is a chance: 0.3 hangs one off three twigs in ten. */
  count: number;
  /** Degrees from world up. 0 stands, 180 hangs. */
  pitch: number;
  /** Degrees of randomness on the pitch, plus or minus. */
  variance: number;
  /** Card height in metres. */
  length: number;
  /** Card width as a fraction of its height. */
  aspect: number;
  /** Divisions up the card. 1 is a rigid quad. */
  segments: number;
  /** Degrees the card bows toward the ground over its length. */
  curve: number;
  /** Scale on the card's flutter weight. Fruit is heavy and a spear frond is stiff. */
  flutter: number;
  /** tree: where the cards attach. */
  attach: AccentAttach;
  /** crown: the band of stem the cards attach over, as fractions down from the
   *  top. Null follows the fronds, 0..frondSpan. */
  depth: [number, number] | null;
}

const ACCENT_DEFAULTS = { variance: 10, aspect: 0.5, segments: 1, curve: 0, flutter: 0.25, attach: 'twigs', depth: null } as const;

const ACCENT_KEYS = ['stamps', 'count', 'pitch', 'length', ...Object.keys(ACCENT_DEFAULTS)] as const;

/** A source name: a folder, optionally followed by /pattern to pick its sets. */
const SOURCE_NAME = /^[a-z0-9][a-z0-9-]*(\/[A-Za-z0-9_*?-]+)?$/;

/**
 * How a tree places the children of its trunk.
 *
 * `fork` divides: the trunk's first child is a leader that carries it on, and
 * every generation below splits again. That is an oak, a birch or a poplar.
 *
 * `whorl` does not divide. The trunk runs unbroken to the tip and carries rings
 * of near-horizontal limbs up it, each ring shorter than the one below. That is
 * a conifer, and it is the one difference between a spruce and a poplar. The
 * limbs themselves fork the ordinary way, so a whorl is a placement rule on the
 * trunk and nothing else about the type changes.
 */
export const BRANCH_MODELS = ['fork', 'whorl'] as const;

export type BranchModel = (typeof BRANCH_MODELS)[number];

/** The impostor block as the layer carries it. Every key may be left out. */
export const IMPOSTOR_DEFAULT: ScatterImpostor = { fromDistance: 0, views: 8, tileSize: 128 };

/** Keys that moved into `impostor`, and where each went. Named in the error,
 *  because a sidecar from before the move must not silently lose its handover. */
const MOVED_INTO_IMPOSTOR: Record<string, keyof ScatterImpostor> = {
  impostorFrom: 'fromDistance',
  impostorViews: 'views',
  impostorTile: 'tileSize',
};

export const PARAM_SPEC = {
  type: { type: 'string', default: 'tree', help: `Structure to grow: ${FORGE_TYPES.join(' | ')}. Picks the generator, not the species.` },
  name: { type: 'string', default: null, help: 'Model id. Names the .glb and the geometry template.' },
  textureSet: { type: 'string', default: null, help: 'Texture set to write or reference. Defaults to name. Share one across variants.' },
  bark: { type: 'list', default: [], help: 'Folder under sources/bark the bark tile comes from, as folder or folder/set. Empty generates it.', texture: true, types: WOODY },
  leaves: { type: 'list', default: [], help: 'Folders under sources/leaves whose stamps fill the leaf image. Empty generates it.', texture: true, types: TREE },
  out: {
    type: 'string',
    default: 'assets/shared/nature/trees',
    byType: {
      clump: 'assets/shared/nature/clumps',
      crown: 'assets/shared/nature/crowns',
      rock: 'assets/shared/nature/rocks',
      pebble: 'assets/shared/nature/pebbles',
    },
    help: 'Directory the model and textures are written to.',
  },
  assetsRoot: { type: 'string', default: 'assets/shared', help: 'Root the template urls are made relative to.' },
  seed: { type: 'int', default: null, help: 'Every random choice. Omit it and the CLI rolls a new model each run.', texture: true },

  height: {
    type: 'number',
    default: 12,
    byType: { clump: 0.35, rock: 1.2, pebble: 0.3 },
    help: 'Finished height in metres. A tree normalises its skeleton to it; a clump sizes its cards to reach it; a rock is this tall before its relief, and so is the largest pebble of a cluster.',
    // A rock's image is baked off its surface, so its size is in the image.
    texture: STONE,
    types: SIZED,
  },
  trunkRadius: { type: 'number', default: 0.32, byType: { crown: 0.22 }, help: 'Trunk radius at the base, in metres.', types: WOODY },
  trunkTaper: { type: 'number', default: 0.22, byType: { crown: 0.8 }, help: 'Trunk radius at the top as a fraction of the base.', types: WOODY },
  trunkFlare: {
    type: 'number',
    default: 0,
    byType: { crown: 0.25 },
    help: 'How far the foot swells past trunkRadius, as a fraction of it. Gone by a fifth of the way up a trunk, a quarter of the way up a stem.',
    types: WOODY,
  },
  trunkFlute: { type: 'number', default: 0, help: 'Depth of the grooves cut up the trunk or stem, as a fraction of its radius. 0 is a turned pole.', types: WOODY },
  trunkWander: { type: 'number', default: 0, help: 'Metres the centre line strays from a straight climb.', types: WOODY },
  branchModel: {
    type: 'string',
    default: 'fork',
    help: `How the trunk carries its children: ${BRANCH_MODELS.join(' | ')}. whorl grows a conifer: rings of limbs up an undivided trunk.`,
    types: TREE,
  },
  splits: { type: 'int', default: 3, help: 'Child branches per split, and per whorl at branchModel whorl.', types: TREE },
  splitAngle: { type: 'number', default: 38, help: 'Degrees a child leaves its parent by. Near 80 at branchModel whorl, where a limb leaves the trunk almost square.', types: TREE },
  splitVariance: { type: 'number', default: 12, help: 'Random degrees added to each split angle.', types: TREE },
  splitSpread: { type: 'number', default: 0.35, help: 'Fraction of the parent the splits are spread back along from its tip. At branchModel whorl it is the fraction of the trunk the whorls climb, down from the top.', types: TREE },
  branchLevels: { type: 'int', default: 4, help: 'Branch generations below the trunk.', types: TREE },
  whorls: { type: 'int', default: 7, help: 'Rings of limbs up the trunk. Read at branchModel whorl alone.', types: TREE },
  whorlTaper: { type: 'number', default: 0.3, help: 'Length of the top whorl as a fraction of the lowest, which is what makes the cone. Read at branchModel whorl alone.', types: TREE },
  lengthRatio: { type: 'number', default: 0.62, help: 'Child length as a fraction of its parent.', types: TREE },
  radiusRatio: { type: 'number', default: 0.6, help: 'Child radius as a fraction of its parent at the attach point.', types: TREE },
  curve: { type: 'number', default: 14, help: 'Total degrees a branch bends along its own length.', types: TREE },
  droop: { type: 'number', default: 16, help: 'Degrees the deepest branches bend toward the ground. Negative bends them back upright.', types: TREE },
  segments: { type: 'int', default: 5, byType: { crown: 8 }, help: 'Rings along each branch.', types: WOODY },
  radialSegments: { type: 'int', default: 8, byType: { crown: 10 }, help: 'Sides of a branch tube. Deeper branches use fewer.', types: WOODY },
  trunkSides: { type: 'int', default: 0, help: 'Sides of the trunk or stem tube alone. 0 takes radialSegments. It is one branch of hundreds, so detail here is cheap.', types: WOODY },
  trunkSegments: { type: 'int', default: 0, help: 'Rings up the trunk or stem alone. 0 takes segments + 2.', types: WOODY },
  barkLevels: { type: 'int', default: 6, help: 'Deepest branch generation that gets a bark tube. Twigs beyond it carry leaves only.', types: TREE },

  leavesPerBranch: { type: 'int', default: 18, help: 'Leaf cards on each leaf-bearing branch.', types: TREE },
  leafLevels: { type: 'int', default: 2, help: 'How many of the deepest branch generations carry leaves.', types: TREE },
  leafEvenness: { type: 'number', default: 1, help: 'How far a card\'s size follows the length of the shoot it sits on, 0..1. 1 makes the spray on a short shoot a scale model of the one on a long shoot, which is what stops the tip of a whorled cone from filling in as a column; 0 draws every card at leafSize whatever it sits on.', types: TREE },
  leafSize: { type: 'number', default: 1, help: 'Leaf card height in metres. Decides how many authored leaves fill a card.', texture: true, types: TREE },
  leafGrid: { type: 'int', default: 0, help: 'Cells along each edge of the leaf image: 1, 2 or 4. Fewer cells give each cluster more texels; more give the canopy more variants. 0 derives it from how many leaves fit a card.', texture: true, types: TREE },
  leafScale: { type: 'number', default: 1, help: 'Card size multiplier that leaves the texture fit alone. Fewer, larger cards for a LOD tier.', types: TREE },
  leafAspect: { type: 'number', default: 0.85, help: 'Leaf card width as a fraction of its height.', types: TREE },
  leafAngle: { type: 'number', default: 55, help: 'Degrees a leaf card turns away from its branch. 0 lies along it, 90 stands out square.', types: TREE },
  leafFrom: { type: 'number', default: 0.15, help: 'Fraction along a tip branch that leaves start at.', types: TREE },
  leafNormalMode: { type: 'string', default: 'canopy', help: 'card | canopy | up. How leaf normals are authored.', types: TREE },
  leafAlphaCutoff: { type: 'number', default: 0.45, byType: { clump: 0.4 }, help: 'glTF alphaCutoff on every cutout piece.', types: LEAFY },

  blades: { type: 'list', default: [], help: 'Folders under sources/clump whose stamps fill the blade atlas. Empty generates them.', texture: true, types: CLUMP },
  tuftsPerModel: { type: 'int', default: 1, help: 'Tufts grown into one model. Above 1 the model is a patch, and the placer resolves one candidate for all of them.', types: CLUMP },
  patchRadius: { type: 'number', default: 0, help: 'Metres the tuft bases are spread over. 0 derives it from the tuft count and height. Ignored at tuftsPerModel 1.', types: CLUMP },
  cardsPerTuft: { type: 'int', default: 5, help: 'Cards radiating from one tuft. The knob to reach for before footprint.', types: CLUMP },
  cardSegments: { type: 'int', default: 3, byType: { crown: 5 }, help: 'Divisions up a card. Wind bends it as a curve rather than tipping it as a plank.', types: CARDED },
  cardLean: { type: 'number', default: 18, help: 'Degrees a card leans outward from upright over its length.', types: CLUMP },
  cardCurve: { type: 'number', default: 26, byType: { crown: 80 }, help: 'Degrees a card bows over its own length, on top of the lean.', types: CARDED },
  cardSpread: { type: 'number', default: 0.22, help: 'How far card bases sit from the tuft centre, as a fraction of height.', types: CLUMP },
  cardAspect: { type: 'number', default: 1, byType: { crown: 0.3 }, help: 'Card width as a fraction of its height. A crown card samples that fraction of its cell.', types: CARDED },
  normalLean: { type: 'number', default: 0.45, byType: { crown: 0.6 }, help: 'How far every normal leans outward from straight up. 0 faces the whole tuft at the sky.', types: CARDED },

  fronds: { type: 'list', default: [], help: 'Folders under sources/fronds whose stamps fill the frond atlas. Empty generates them.', texture: true, types: CROWN },
  stemHeight: { type: 'number', default: 6, help: 'Metres of stem below the rosette. 0 grows none, which is a fern.', types: CROWN },
  stemLean: { type: 'number', default: 10, help: 'Degrees the stem has bent over by its top. Eases in, so a palm leans from its upper half.', types: CROWN },
  crownBulge: { type: 'number', default: 0.2, help: 'How far the stem swells under the rosette, as a fraction of trunkRadius. A palm\'s crownshaft.', types: CROWN },
  frondCount: { type: 'int', default: 14, help: 'Frond cards in the rosette.', types: CROWN },
  frondLength: { type: 'number', default: 3, help: 'Frond length in metres, base to tip along its curve. Frond 0 is full length and the rest fall short of it.', types: CROWN },
  frondAngle: { type: 'number', default: 45, help: 'Degrees above horizontal a frond leaves the rosette at, before cardCurve bends it down.', types: CROWN },
  frondVariance: { type: 'number', default: 20, help: 'Random degrees added to each frond angle: the spread between young fronds standing up and old ones hanging.', types: CROWN },
  frondSpan: { type: 'number', default: 0, help: 'Fraction of the stem, down from its top, the fronds attach along. 0 puts every frond at the top; the lowest hang most.', types: CROWN },

  width: { type: 'number', default: 0, help: 'Metres across the stone along x, before its relief. On a cluster it is the largest pebble, and the rest scale with it. 0 derives it from height.', texture: true, types: STONE },
  depth: { type: 'number', default: 0, help: 'Metres across the stone along z, before its relief. On a cluster it is the largest pebble, and the rest scale with it. 0 derives it from height.', texture: true, types: STONE },
  scoops: { type: 'int', default: 9, byType: { pebble: 6 }, help: 'Spheres scooped out of the rock. Each cuts a concave face, and the faces meet at rounded ridges. 0 is an egg.', texture: true, types: STONE },
  scoopSize: { type: 'number', default: 0.8, byType: { pebble: 0.88 }, help: 'How broad a scoop is, 0.3..0.97, as its radius over its distance from the centre. Near 1 is a broad shallow face like a plane; near 0.5 a tight bite.', texture: true, types: STONE },
  scoopDepth: { type: 'number', default: 0.35, byType: { pebble: 0.24 }, help: 'How deep the deepest scoop reaches in, as a fraction of the radius, 0..0.6. Each scoop takes 0.35..1 of it.', texture: true, types: STONE },
  relief: { type: 'number', default: 0.1, byType: { pebble: 0.07 }, help: 'Depth of the surface noise as a fraction of the radius.', texture: true, types: STONE },
  reliefSize: { type: 'number', default: 0.9, byType: { pebble: 0.1 }, help: 'Metres across the largest lump of the surface noise. Each octave above it is half the size.', texture: true, types: STONE },
  reliefOctaves: { type: 'int', default: 5, byType: { pebble: 3 }, help: 'Octaves of surface noise under reliefSize. More is finer detail at lower amplitude.', texture: true, types: STONE },
  plates: { type: 'number', default: 2, byType: { pebble: 0 }, help: 'Slab cells per metre in the pile the relief is built from. 0 builds it from noise alone.', texture: true, types: STONE },
  plateLayers: { type: 'int', default: 2, help: 'Layers of slabs, each 1.7x finer than the last, chipping the ones below.', texture: true, types: STONE },
  plateBevel: { type: 'number', default: 0.35, help: 'Fraction of a slab that slopes to its edge, 0..1. Low is flat-topped and sharp; 1 is a pyramid.', texture: true, types: STONE },
  plateLean: { type: 'number', default: 0.3, help: 'How far a slab drops across its own width, 0..1 of its height.', texture: true, types: STONE },
  bedding: { type: 'number', default: 0.6, help: 'How far the slabs are flattened and aligned into strata, 0..1. 0 is a random rubble of blocks.', texture: true, types: STONE },
  plateShare: { type: 'number', default: 0.7, help: 'Share of the relief the slabs take, 0..1. The noise has the rest.', texture: true, types: STONE },
  plateTint: { type: 'number', default: 0.25, help: 'How far each slab shifts the tone by its own value, 0..1.', texture: true, types: STONE },
  laminae: { type: 'number', default: 0, help: 'Opacity of the bedding laminae in the texture, 0..1: the stack of beds a sedimentary rock was laid down in, each its own colour and hardness. This is the texture alone, and the geometry is laminaeRelief, so a gentle banding over another rock type is laminae 0.2 with laminaeRelief 0. 0 draws none at all. Composes with everything: the bands shift the tone before the palette ramp, so the grain, the veins, the cracks and the weathering all sit on top of them.', texture: true, types: STONE },
  laminaeSize: { type: 'number', default: 0.06, help: 'Metres of one bed. Beds thicker than a mesh quad rib the silhouette; thinner ones stay in the height map, the way a fine crack does.', texture: true, types: STONE },
  laminaeVary: { type: 'number', default: 0.7, help: 'How far bed thicknesses vary from one another, 0..1. 0 is a ruled stack of one thickness; 1 mixes thick beds with hairlines.', texture: true, types: STONE },
  laminaeRelief: { type: 'number', default: 0.04, help: 'How far a hard bed stands proud of a soft one in the mesh, as a fraction of the radius. This is differential weathering, and it is most of what makes a bedded face read. It is the geometry alone and is not scaled by laminae, so the two are independent: 0 leaves the beds to the texture and never moves a vertex.', texture: true, types: STONE },
  laminaeTint: { type: 'number', default: 0.5, help: 'How far each bed shifts along the stone\'s own dark-to-light ramp, 0..1. The bands stay the rock\'s own colours, so a tuned palette is never fought.', texture: true, types: STONE },
  laminaeWarp: { type: 'number', default: 0.6, help: 'How far the bands wander across the rock, in beds. 0 rules them dead level, which reads as printed on.', texture: true, types: STONE },
  laminaeWarpSize: { type: 'number', default: 1.2, help: 'Metres across one swell of that wander. Near the rock\'s own size the whole stack sags; far under it the bands ripple.', texture: true, types: STONE },
  laminaeAccent: { type: 'string', default: '#d9d2c0', help: 'The colour the odd standout bed takes, six digit hex: the pale seam or the iron-red band that is not on the stone\'s ramp at all. Read only at laminaeAccentShare above 0.', texture: true, types: STONE },
  laminaeAccentShare: { type: 'number', default: 0, help: 'Share of beds taking laminaeAccent rather than the ramp, 0..1. 0 keeps every band in the stone\'s own colours.', texture: true, types: STONE },

  smoothing: { type: 'number', default: 0.5, byType: { pebble: 0.9 }, help: 'How far the creases of the field are rounded, 0..1: the ridges between scoops, the slab edges and joins, the creases of the ridged noise. 0 is knife-edged; 1 is about a tenth smaller, because rounding only pulls the surface in.', texture: true, types: STONE },
  cracks: { type: 'number', default: 1.2, byType: { pebble: 0 }, help: 'Crack cells per metre. 0 draws none.', texture: true, types: STONE },
  crackStrength: { type: 'number', default: 1, help: 'How strongly the texture draws the cracks, 0..1. 0 draws none and keeps the grooves; cracks 0 removes both.', texture: true, types: STONE },
  grooveDepth: { type: 'number', default: 0.05, help: 'How deep the coarse cracks cut into the mesh, as a fraction of the radius.', texture: true, types: STONE },
  grooveWidth: { type: 'number', default: 0.15, help: 'Width of that groove as a fraction of a crack cell. The texture crack sits at its bottom.', texture: true, types: STONE },
  weathering: { type: 'number', default: 0.6, byType: { pebble: 0 }, help: 'How far exposure goes, 0..1: lichen, dirt in the hollows, drip stains and soil up the base.', texture: true, types: STONE },
  patina: { type: 'number', default: 0.5, byType: { pebble: 0 }, help: 'The dark crust old stone grows where water sits or runs, 0..1: on the tops, in the hollows, beside the cracks, under the drip lines and around the lichen, never on a worn edge.', texture: true, types: STONE },
  edgeWear: { type: 'number', default: 0.5, byType: { pebble: 0 }, help: 'How far the convex edges are weathered, 0..1: bleached toward edgeTint, smoother, and kept clear of stain, patina and lichen.', texture: true, types: STONE },
  streaks: { type: 'number', default: 0, help: 'Opacity of the run-off streaks down the sides, 0..1: droplet trails from a splat, full colour at the head and thinning and fading as they fall, branching into the cracks. Colour and finish only, never height.', texture: true, types: STONE },
  streakCount: { type: 'int', default: 12, help: 'Streaks around the rock, 0..100, spaced unevenly, each at its own height, run and fade.', texture: true, types: STONE },
  snow: { type: 'number', default: 0, help: 'Snow on the faces that look up, 0..1. 0 is none; 0.5 the tops; 1 everything but the sides and the edges.', texture: true, types: STONE },
  topWash: { type: 'number', default: 0, help: 'How far down the faces that look up the topTint wash reaches, 0..1, on the same scale as snow. 0 is none.', texture: true, types: STONE },
  topOpacity: { type: 'number', default: 1, help: 'How strongly the wash multiplies the stone it reaches, 0..1. Part of the base colour: the glint, the veins, the stain and the growth are never tinted by it.', texture: true, types: STONE },
  stain: { type: 'number', default: 0.5, byType: { pebble: 0 }, help: 'How strongly iron staining is drawn, 0..1: rust seeping from the cracks and in bands down the bedding.', texture: true, types: STONE },
  veins: { type: 'number', default: 0.15, byType: { pebble: 0 }, help: 'How much of the stone the quartz veins run through, 0..1. 0 draws none.', texture: true, types: STONE },
  stoneTint: { type: 'string', default: '#7f827c', help: 'The mid tone of the stone, six digit hex.', texture: true, types: STONE },
  stoneDark: { type: 'string', default: '#3e403e', help: 'The dark end of the stone and its dark minerals, six digit hex.', texture: true, types: STONE },
  stoneLight: { type: 'string', default: '#b3b5ae', help: 'The light end of the stone, its light minerals and its veins, six digit hex.', texture: true, types: STONE },
  lichenTint: { type: 'string', default: '#a7b094', help: 'The crustose lichen discs on the exposed faces, six digit hex.', texture: true, types: STONE },
  soilTint: { type: 'string', default: '#4f4a36', help: 'Dirt in the hollows and soil up the base, six digit hex.', texture: true, types: STONE },
  stainTint: { type: 'string', default: '#8a5a2e', help: 'The iron staining, six digit hex.', texture: true, types: STONE },
  streakTint: { type: 'string', default: '#2a2d28', help: 'What the run-off leaves, six digit hex. Near black is mould and algae; white is bird droppings.', texture: true, types: STONE },
  topTint: { type: 'string', default: '#808080', help: 'What the faces that look up are multiplied by, six digit hex read with #808080 as no change: lighter lifts them, darker shades them, and a hue warms or cools them.', texture: true, types: STONE },
  edgeTint: { type: 'string', default: '#c6c3ba', help: 'The bleached colour a worn edge weathers to, six digit hex.', texture: true, types: STONE },
  toneSize: { type: 'number', default: 0.25, byType: { pebble: 0.06 }, help: 'Metres across the largest patch of the tone mottling, the octave stack the colour is ramped from.', texture: true, types: STONE },
  toneOctaves: { type: 'int', default: 5, help: 'Octaves of tone mottling under toneSize.', texture: true, types: STONE },
  toneContrast: { type: 'number', default: 0.45, help: 'How far the tone reaches from stoneTint toward stoneDark and stoneLight, 0..1.', texture: true, types: STONE },
  grainScale: { type: 'number', default: 110, byType: { pebble: 260 }, help: 'Mineral crystals per metre: the size of the grain.', texture: true, types: STONE },
  speckle: { type: 'number', default: 0.6, help: 'How strongly the mineral grain is drawn, 0..1. 0 draws none.', texture: true, types: STONE },
  bump: { type: 'number', default: 1, help: 'Gain of the normal map derived from the texture height, as a multiple of the settled value. 2 is twice as steep; 0.5 half.', texture: true, types: STONE },
  undulation: { type: 'number', default: 0.5, help: 'Soft, irregular unevenness in the texture height, 0..1: the slow waviness of a weathered face, between what the mesh carries and the grain. Height alone.', texture: true, types: STONE },
  undulationSize: { type: 'number', default: 0.09, byType: { pebble: 0.03 }, help: 'Metres across the largest swell of that unevenness. Two finer octaves ride under it.', texture: true, types: STONE },
  roughness: { type: 'number', default: 0.82, help: 'Base roughness of the stone, 0..1, before the grain, the wear and the growth move it. 0.9 is dry sandstone; 0.55 wet or polished rock.', texture: true, types: STONE },
  metallic: { type: 'number', default: 0, help: 'Base metalness of the stone, 0..1. 0 is stone; 0.3 an ore-bearing rock; 1 a lump of metal.', texture: true, types: STONE },
  glint: { type: 'number', default: 0.25, help: 'How much of the stone holds metallic flakes, 0..1: angular mica and pyrite shards, glossy and fully metallic, set into the surface.', texture: true, types: STONE },
  glintScale: { type: 'number', default: 30, help: 'Metallic flakes per metre: the size of a shard. 30 is about 3cm, 120 a speck.', texture: true, types: STONE },
  glintTint: { type: 'string', default: '#d8c9a4', help: 'The colour of those flakes, six digit hex. Pale brass is pyrite; a light grey is mica.', texture: true, types: STONE },
  crackWidth: { type: 'number', default: 0.035, help: 'Width of the crack line in the texture as a fraction of a crack cell.', texture: true, types: STONE },
  crackDepth: { type: 'number', default: 0.6, help: 'How deep the crack line cuts into the texture height, 0..1.', texture: true, types: STONE },
  vesicles: { type: 'number', default: 0, help: 'How full of gas holes the stone is, 0..1: the share of the lattice cells that hold a bubble. 0.3 is a vesicular basalt; 0.8 a scoria. 0 draws none.', texture: true, types: STONE },
  vesicleSize: { type: 'number', default: 0.02, help: 'Metres across the largest bubble, 0..0.5. The surface cuts each bubble at its own height, so the holes it shows are this size and smaller. Holes wider than two mesh quads are cut into the mesh as well, at full depth from four; smaller ones stay in the texture.', texture: true, types: STONE },
  vesicleVary: { type: 'number', default: 0.6, help: 'How far the bubble sizes spread, 0..1. 0 is one size of bubble; 1 adds two finer generations, many small holes among few large ones.', texture: true, types: STONE },
  vesicleStretch: { type: 'number', default: 0, help: 'How far the lava flow drew the bubbles out into ovals, 0..1, along the bedding. 1 is three times longer than wide.', texture: true, types: STONE },
  vesicleZoning: { type: 'number', default: 0, help: 'How far the bubbles gather into zones along the bedding, 0..1. 0 spreads them evenly; 1 leaves dense stone between frothy bands.', texture: true, types: STONE },
  vesicleDepth: { type: 'number', default: 0.8, help: 'How deep a hole goes, 0..1, as a fraction of its own radius. 1 is the full bowl of the bubble.', texture: true, types: STONE },
  vesicleTint: { type: 'string', default: '#3d3d3d', help: 'The colour an open hole is darkened by, six digit hex, multiplied over the stone so the grain stays under it. Near black is the glass lining a basalt bubble; white leaves the hole untinted.', texture: true, types: STONE },
  amygdales: { type: 'number', default: 0, help: 'Share of the holes filled with minerals, 0..1: pale spots flush with the stone, in amygdaleTint.', texture: true, types: STONE },
  amygdaleTint: { type: 'string', default: '#8f8b7b', help: 'The mineral that fills a hole, six digit hex, added to the stone so the grain stays under it. A pale grey is calcite or zeolite; a soft green is chlorite; black fills nothing.', texture: true, types: STONE },
  subdivisions: { type: 'int', default: 24, byType: { pebble: 6 }, help: 'Quads along each edge of the cube a stone is grown from. Six faces of this squared, doubled, is the triangle count, and a cluster pays it once per pebble.', types: STONE },

  pebblesPerModel: { type: 'int', default: 12, help: 'Pebbles packed into one cluster. Each is its own stone with its own six charts, so the image and the bake grow with this.', texture: true, types: PEBBLE },
  pebbleSmallest: { type: 'number', default: 0.4, help: 'The smallest pebble as a fraction of the largest, 0..1. The run between them bends toward the small end, so a cluster is a few stones with gravel around them.', texture: true, types: PEBBLE },
  pebbleSpacing: { type: 'number', default: 1, help: 'How far apart the stones of a cluster sit, as a multiple of them touching. 1 nestles them, 2 leaves a stone\'s width of ground between neighbours, 3 is a thin scatter. Raising it grows the derived clusterRadius with it, so the cluster spreads rather than spilling past its own footprint.', types: PEBBLE },
  clusterRadius: { type: 'number', default: 0, help: 'Metres the pebble bases are spread over. 0 derives it from the ground the pebbles cover, so raising pebblesPerModel spreads the cluster rather than packing it.', types: PEBBLE },

  bendCurve: {
    type: 'number',
    default: 1.6,
    byType: { clump: 1 },
    help: 'Exponent shaping COLOR_0.r. Higher keeps the base rigid for longer. A blade bends along its whole length, so a clump wants 1.',
    types: LEAFY,
  },

  accents: { type: 'accents', default: [], help: 'Cards hung plumb off the model, off their own stamps under sources/accents: [{ stamps, count, pitch, length, variance?, aspect?, segments?, curve?, flutter?, attach?, depth? }]. Spires at pitch 0, fruit and skirts at 180.', texture: true, types: LEAFY },
  lods: { type: 'tiers', default: [], help: 'Coarser tiers, nearest first: [{ distance, radialSegments?, barkLevels?, leavesPerBranch?, leafScale?, cardSegments?, subdivisions? }]. Each override must be a key of the type.', types: TIERED },

  windAmplitude: { type: 'number', default: 0.4, help: 'ScatterWind amplitude for the emitted layer.', byType: { clump: 0.18 }, types: LEAFY },
  windFrequency: { type: 'number', default: 0.45, help: 'ScatterWind frequency for the emitted layer.', byType: { clump: 1.1 }, types: LEAFY },
  windFlutter: { type: 'number', default: 0.35, help: 'ScatterWind flutter for the emitted layer.', byType: { clump: 0.7 }, types: LEAFY },
  cullDistance: { type: 'number', default: 160, help: 'ScatterLayer cullDistance for the emitted layer.', byType: { clump: 50, rock: 800, pebble: 60 } },
  castShadow: { type: 'flag', default: true, byType: { clump: false, crown: null, pebble: false }, help: 'Draw the emitted layer into the shadow maps. A clump and a pebble cluster default off, because a shadow that small costs a draw to resolve into nothing; a crown casts while it has a stem.' },
  foliage: { type: 'flag', default: true, help: 'Shade the cutout piece as foliage: no specular, with transmission. Off shades it as a standard metallic-roughness surface.', types: LEAFY },
  impostor: { type: 'impostor', default: IMPOSTOR_DEFAULT, byType: { clump: null, crown: null, pebble: null, rock: { fromDistance: 120, views: 8, tileSize: 128 } }, help: "The layer's impostor block, keyed as the layer keys it: { fromDistance, views, tileSize }. fromDistance 0 derives it from cullDistance; views is per axis, at least 2; tileSize is in pixels. A clump or a stemless crown bakes one only if the file sets it." },
  footprint: { type: 'number', default: 0, help: 'ScatterLayer footprint in metres. 0 derives it from the model. The most expensive number here: candidates go as 1/footprint squared.', byType: { clump: 0.7 } },
  scaleMin: { type: 'number', default: 0.8, byType: { clump: 0.75, rock: 0.6, pebble: 0.7 }, help: 'Lower bound of the emitted scale jitter.' },
  scaleMax: { type: 'number', default: 1.25, help: 'Upper bound of the emitted scale jitter.', byType: { clump: 1.3, rock: 1.6, pebble: 1.4 } },

  textureSize: { type: 'int', default: 1024, byType: { clump: 2048, crown: 2048, pebble: 128 }, help: "Edge of the square texture template, and the long edge of the bark one; an authored bark keeps its shape and is reduced to fit. A clump or frond atlas holds every stamp, so it starts larger. A stone's chart is half this edge: a rock is one block of six charts, and a cluster is one block per pebble, so a pebble's charts are small and there are many.", texture: true },
  barkTextureSize: { type: 'int', default: 0, help: 'Long edge of the bark map in pixels, so the bark and the leaf atlas can differ. 0 follows textureSize.', texture: true, types: WOODY },
  barkAspect: { type: 'int', default: 2, help: 'How many times taller than wide the bark map is, and how many circumferences of branch one tile covers. 1 is square.', texture: true, types: WOODY },
  preview: { type: 'int', default: 0, help: 'Write a shaded preview PNG at this pixel size. 0 writes none.' },
  previewAngles: { type: 'int', default: 4, help: 'Views in that preview: 4 lays quarter turns out 2x2, 1 writes the three-quarter view alone at this size, for a single screenshot.' },
  skipTextures: { type: 'flag', default: false, help: 'Reuse an existing texture set rather than writing one.' },
  writeTemplates: { type: 'flag', default: false, help: 'Patch geometries.json and materials.json in place.' },
  templatesDir: { type: 'string', default: 'templates', help: 'Directory holding geometries.json, materials.json and scatter-layers.json.' },
} as const satisfies Record<string, ParamSpec>;

/**
 * The resolved parameter set, derived from the table above rather than written
 * out beside it. A second hand-kept interface would drift from the flags the
 * moment one was added, and the drift would only show as an unread option.
 *
 * Every `null` default is filled in by `resolveParams`, so the type states what
 * a caller receives and not what the table declares.
 */
type Options = {
  -readonly [K in keyof typeof PARAM_SPEC]: (typeof PARAM_SPEC)[K]['type'] extends 'flag'
    ? boolean
    : (typeof PARAM_SPEC)[K]['type'] extends 'string'
    ? string
    : (typeof PARAM_SPEC)[K]['type'] extends 'list'
    ? string[]
    : (typeof PARAM_SPEC)[K]['type'] extends 'tiers'
    ? LodTier[]
    : (typeof PARAM_SPEC)[K]['type'] extends 'impostor'
    ? ScatterImpostor | null
    : (typeof PARAM_SPEC)[K]['type'] extends 'accents'
    ? AccentSpec[]
    : number;
};

/**
 * The options, plus the settled look values from `look.ts`. Those are fields
 * here and not flags: nothing asks for them, everything reads them, and a test
 * can still build a variant by overriding one on the object.
 */
export type Params = Omit<Options, 'type'> & { type: ForgeType } & {
  -readonly [K in keyof typeof LOOK]: (typeof LOOK)[K] extends string ? string : number;
};

/** What a tree.json holds, before defaults and validation. */
export type RawConfig = Partial<
  Record<keyof typeof PARAM_SPEC, string | number | boolean | string[] | LodTier[] | Partial<AccentSpec>[] | Partial<ScatterImpostor>>
>;

function isParamKey(key: string): key is keyof typeof PARAM_SPEC {
  return key in PARAM_SPEC;
}

/**
 * Checks a parsed tree.json down to the keys the table knows.
 *
 * Rejects an unknown key rather than ignoring it, because the whole point of
 * the file is to be hand-edited, and a silently dropped typo is a change that
 * appears not to have worked.
 */
/** The type a raw config asks for, checked before anything is read against it. */
export function typeOf(config: RawConfig | Record<string, unknown>, source: string): ForgeType {
  const value = (config as Record<string, unknown>).type;
  if (value === undefined || value === null) return 'tree';
  if (typeof value !== 'string' || !isForgeType(value))
    throw new Error(`${source} option 'type' must be one of ${FORGE_TYPES.join(', ')}, got '${String(value)}'.`);
  return value;
}

export function parseConfig(config: unknown, source: string): RawConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${source} must hold a JSON object.`);

  const modelType = typeOf(config as Record<string, unknown>, source);
  const out: RawConfig = {};

  for (const [key, value] of Object.entries(config)) {
    if (value === null || value === undefined) continue;

    // A sidecar written before a key was retired still opens, without that
    // value doing anything. Erroring would strand every tree.json on disk.
    if (retiredKeys().includes(key)) continue;

    if (key in MOVED_INTO_IMPOSTOR)
      throw new Error(`${source} option '${key}' is now 'impostor.${MOVED_INTO_IMPOSTOR[key]}'.`);

    if (!isParamKey(key)) throw new Error(`${source} has an unknown option '${key}'.`);

    // A key that exists but belongs to another structure is rejected for the
    // same reason an unknown one is: silently dropping it makes an edit look
    // like it did not work. The message names the type that does take it, so
    // the fix is obvious.
    const owners = (PARAM_SPEC[key] as ParamSpec).types;
    if (owners && !owners.includes(modelType)) {
      const instead = (PARAM_SPEC[key] as ParamSpec).insteadFor?.[modelType];
      throw new Error(
        `${source} option '${key}' applies to ${owners.join(', ')}, not to type '${modelType}'.` +
          (instead ? ` A ${modelType} takes '${instead}' instead.` : '')
      );
    }

    if (PARAM_SPEC[key].type === 'tiers') {
      if (!Array.isArray(value)) throw new Error(`${source} option '${key}' must be a list of tiers.`);
      out[key] = value.map((entry, index) => parseTier(entry, `${source} option '${key}' tier ${index}`, modelType));
      continue;
    }

    if (PARAM_SPEC[key].type === 'impostor') {
      out[key] = parseImpostor(value, `${source} option '${key}'`);
      continue;
    }

    // Checked here so the error names the file, and kept raw so resolveParams
    // can parse it under the same rules: a parsed entry carries the other
    // types' defaults, which the check would reject on the second pass.
    if (PARAM_SPEC[key].type === 'accents') {
      parseAccents(value, `${source} option '${key}'`, modelType);
      out[key] = value as Partial<AccentSpec>[];
      continue;
    }

    if (Array.isArray(value)) {
      if (!value.every((entry) => typeof entry === 'string'))
        throw new Error(`${source} option '${key}' must be a list of strings.`);
      out[key] = value as string[];
      continue;
    }

    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new Error(`${source} option '${key}' must be a string, number, boolean or list of strings.`);

    out[key] = value;
  }

  return out;
}

function parseTier(entry: unknown, source: string, modelType: ForgeType): LodTier {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${source} must be an object with a distance.`);

  const tier: LodTier = { distance: NaN };
  for (const [key, value] of Object.entries(entry)) {
    if (key !== 'distance' && !(LOD_OVERRIDES as readonly string[]).includes(key))
      throw new Error(`${source} has an unknown key '${key}'. A tier takes distance, ${LOD_OVERRIDES.join(', ')}.`);

    // An override of a key this type never reads is the same silent no-op a
    // stray top-level key would be.
    const owners = isParamKey(key) ? (PARAM_SPEC[key] as ParamSpec).types : undefined;
    if (owners && !owners.includes(modelType))
      throw new Error(`${source} key '${key}' applies to ${owners.join(', ')}, not to a ${modelType}'s tier.`);

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${source} key '${key}' must be a number, got '${value}'.`);
    const spec = isParamKey(key) ? PARAM_SPEC[key] : null;
    tier[key as keyof LodTier] = spec?.type === 'int' ? Math.round(parsed) : parsed;
  }

  if (!Number.isFinite(tier.distance)) throw new Error(`${source} needs a distance.`);
  return tier;
}

function parseAccents(value: unknown, source: string, modelType: ForgeType): AccentSpec[] {
  if (!Array.isArray(value)) throw new Error(`${source} must be a list of accents.`);
  return value.map((entry, index) => parseAccent(entry, `${source} entry ${index}`, modelType));
}

/**
 * One accent, defaults filled and every value held to its range here rather
 * than at build time, so a bad entry stops the run naming which one.
 */
function parseAccent(entry: unknown, source: string, modelType: ForgeType): AccentSpec {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${source} must be an object: { stamps, count, pitch, length, ... }.`);

  const raw = entry as Record<string, unknown>;
  for (const key of Object.keys(raw))
    if (!(ACCENT_KEYS as readonly string[]).includes(key))
      throw new Error(`${source} has an unknown key '${key}'. An accent takes ${ACCENT_KEYS.join(', ')}.`);

  for (const key of ['stamps', 'count', 'pitch', 'length'] as const)
    if (raw[key] === undefined || raw[key] === null) throw new Error(`${source} needs '${key}'.`);

  if ('attach' in raw && modelType !== 'tree') throw new Error(`${source} key 'attach' applies to tree, not to a ${modelType}.`);
  if ('depth' in raw && modelType !== 'crown') throw new Error(`${source} key 'depth' applies to crown, not to a ${modelType}.`);

  const stamps = raw.stamps;
  if (!Array.isArray(stamps) || !stamps.length || !stamps.every((name) => typeof name === 'string'))
    throw new Error(`${source} 'stamps' must be a non-empty list of folders under sources/accents.`);
  for (const name of stamps as string[])
    if (!SOURCE_NAME.test(name))
      throw new Error(
        `${source} stamp source '${name}' must be a folder of lowercase, digits and hyphens, optionally followed by /pattern.`
      );

  const number = (key: string, low: number, high: number, fallback?: number): number => {
    const value = raw[key] === undefined ? fallback : Number(raw[key]);
    if (value === undefined || !Number.isFinite(value)) throw new Error(`${source} key '${key}' must be a number, got '${raw[key]}'.`);
    if (value < low || value > high) throw new Error(`${source} key '${key}' must be within ${low}..${high}, got ${value}.`);
    return value;
  };

  const length = number('length', 0, Infinity);
  if (length === 0) throw new Error(`${source} key 'length' must be positive.`);
  const aspect = number('aspect', 0, Infinity, ACCENT_DEFAULTS.aspect);
  if (aspect === 0) throw new Error(`${source} key 'aspect' must be positive.`);

  const attach = raw.attach === undefined ? ACCENT_DEFAULTS.attach : raw.attach;
  if (typeof attach !== 'string' || !(ACCENT_ATTACH as readonly string[]).includes(attach))
    throw new Error(`${source} key 'attach' must be one of ${ACCENT_ATTACH.join(', ')}, got '${String(raw.attach)}'.`);

  let depth: [number, number] | null = null;
  if (raw.depth !== undefined && raw.depth !== null) {
    const pair = raw.depth;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((v) => Number.isFinite(Number(v))))
      throw new Error(`${source} key 'depth' must be two fractions of the stem down from its top, [from, to].`);
    depth = [Number(pair[0]), Number(pair[1])];
    if (depth[0] < 0 || depth[1] > 1 || depth[0] > depth[1])
      throw new Error(`${source} key 'depth' must satisfy 0 <= from <= to <= 1, got [${depth.join(', ')}].`);
  }

  return {
    stamps: [...(stamps as string[])],
    count: number('count', 0, Infinity),
    pitch: number('pitch', 0, 180),
    variance: number('variance', 0, 180, ACCENT_DEFAULTS.variance),
    length,
    aspect,
    segments: Math.round(number('segments', 1, 12, ACCENT_DEFAULTS.segments)),
    curve: number('curve', -180, 180, ACCENT_DEFAULTS.curve),
    flutter: number('flutter', 0, 1, ACCENT_DEFAULTS.flutter),
    attach: attach as AccentAttach,
    depth,
  };
}

/** A partial impostor block: what the file sets, the defaults filling the rest. */
function parseImpostor(entry: unknown, source: string): Partial<ScatterImpostor> {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${source} must be an object: { fromDistance, views, tileSize }.`);

  const block: Partial<ScatterImpostor> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!(key in IMPOSTOR_DEFAULT))
      throw new Error(`${source} has an unknown key '${key}'. It takes ${Object.keys(IMPOSTOR_DEFAULT).join(', ')}.`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${source} key '${key}' must be a number, got '${value}'.`);
    block[key as keyof ScatterImpostor] = key === 'fromDistance' ? parsed : Math.round(parsed);
  }
  return block;
}

/** The parameters as they are written beside the model, ready to be edited. */
export function toConfig(params: Params): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...params };

  // The settled look values are not input, so they are not written back. A file
  // that still carries them from before keeps opening; it just loses them on
  // the next save.
  for (const key of retiredKeys()) delete saved[key];

  // Nor are another type's keys. They resolved to defaults nothing read, and
  // writing them would produce a sidecar the next run rejects for setting a key
  // this type does not take.
  for (const [key, spec] of Object.entries(PARAM_SPEC) as [string, ParamSpec][])
    if (spec.types && !spec.types.includes(params.type)) delete saved[key];

  // An accent's per-type keys go the same way: a crown's sidecar carrying a
  // tree's default `attach` would be rejected on the way back in.
  if ('accents' in saved)
    saved.accents = params.accents.map(({ attach, depth, ...rest }) => ({
      ...rest,
      ...(params.type === 'tree' ? { attach } : {}),
      ...(params.type === 'crown' && depth ? { depth } : {}),
    }));

  return saved;
}

export function resolveParams(raw: RawConfig): Params {
  const modelType = typeOf(raw, 'This config');

  // Built dynamically because the loop walks the table, then asserted once. The
  // mapped type above is what every reader is checked against.
  const params: Record<string, string | number | boolean | string[] | LodTier[] | AccentSpec[] | ScatterImpostor | null> = {};

  for (const [key, spec] of Object.entries(PARAM_SPEC) as [
    keyof typeof PARAM_SPEC,
    ParamSpec
  ][]) {
    const value = raw[key];

    // Every key resolves for every type, even one this type does not use. The
    // filtering that matters happened in parseConfig, where a key set by hand
    // was rejected; keeping the object complete here is what lets the mapped
    // type above stay free of optionals.
    if (value === undefined || value === null) {
      const fallback = spec.byType && modelType in spec.byType ? spec.byType[modelType] : spec.default;
      params[key] = Array.isArray(fallback)
        ? ([...fallback] as string[] | LodTier[] | AccentSpec[])
        : fallback && typeof fallback === 'object'
        ? { ...(fallback as ScatterImpostor) }
        : (fallback as string | number | boolean | null);
      continue;
    }

    if (spec.type === 'tiers') {
      if (!Array.isArray(value)) throw new Error(`Option '${key}' must be a list of tiers.`);
      params[key] = value.map((entry) => parseTier(entry, `Option '${key}'`, modelType));
      continue;
    }

    if (spec.type === 'impostor') {
      params[key] = { ...IMPOSTOR_DEFAULT, ...parseImpostor(value, `Option '${key}'`) };
      continue;
    }

    if (spec.type === 'accents') {
      params[key] = parseAccents(value, `Option '${key}'`, modelType);
      continue;
    }

    if (spec.type === 'list') {
      if (!Array.isArray(value)) throw new Error(`Option '${key}' must be a list of source names.`);
      params[key] = [...value] as string[];
      continue;
    }

    if (spec.type === 'number' || spec.type === 'int') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`Option '${key}' must be a number, got '${value}'.`);
      params[key] = spec.type === 'int' ? Math.round(parsed) : parsed;
      continue;
    }

    params[key] = spec.type === 'flag' ? !!value : String(value);
  }

  const name = params.name;
  if (typeof name !== 'string' || !name) throw new Error("'name' is required.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error(`name '${name}' must be lowercase, digits and hyphens: it becomes a filename and a template key.`);

  params.textureSet ??= name;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(params.textureSet)))
    throw new Error(`textureSet '${params.textureSet}' must be lowercase, digits and hyphens.`);

  // Source names are folder names, held to the same alphabet as the outputs.
  // A source may add `/pattern` to take only the sets whose prefix matches it:
  // a subset of a stamp folder's stamps, or the one tile of a bark folder that
  // holds several.
  for (const key of ['bark', 'leaves', 'blades', 'fronds'] as const)
    for (const entry of params[key] as string[])
      if (!SOURCE_NAME.test(entry))
        throw new Error(
          `${key} source '${entry}' must be a folder of lowercase, digits and hyphens, ` +
            `optionally followed by /pattern to pick its sets, as in 'palm/green-*'.`
        );

  params.seed ??= hashString(name);

  // A crown decides both by its stem: a palm throws a shadow and hands over to
  // a billboard, and a fern is ground cover whose shadow is a flicker under
  // itself and which culls instead.
  const stemmed = modelType === 'crown' && Number(params.stemHeight) > 0;
  params.castShadow ??= stemmed;
  if (stemmed) params.impostor ??= { ...IMPOSTOR_DEFAULT };

  const resolved = { ...params, ...LOOK } as Params;
  validate(resolved);
  // A stemless crown takes the tube keys and reads none of them, so there is
  // nothing for a flute to be cut into and nothing to hold it to.
  if (resolved.type === 'tree' || hasStem(resolved)) validateTrunkDetail(resolved);
  if (resolved.lods.length) validateTiers(resolved);
  return resolved;
}

/** A tier's full parameter set: the model's, with the tier's overrides on top. */
export function tierParams(params: Params, tier: LodTier): Params {
  const overrides: Partial<Params> = {};
  for (const key of LOD_OVERRIDES) if (tier[key] !== undefined) overrides[key] = tier[key];
  return { ...params, ...overrides };
}

// Where the impostor takes over when `impostor.fromDistance` does not say, as a
// fraction of the cull distance.
//
// It is only a fallback. The right handover is decided by the impostor's own
// resolution: a tile stops being enough the moment the tree covers more pixels
// than the tile has, and that distance depends on the tree's height and the
// tile size rather than on how far the layer happens to draw. Trees tuned in
// the engine sit well inside this, which is why the value is overridable.
export const IMPOSTOR_FRACTION = 0.6;

/**
 * Metres the impostor takes over at: what the file says, else the fraction of
 * the cull distance above.
 *
 * Read by the emitted layer and by the tier ceiling both, so a chain can never
 * be validated against one distance and shipped against another.
 */
export function impostorDistance(params: Params): number {
  const from = params.impostor?.fromDistance ?? 0;
  return from > 0 ? from : Math.round(params.cullDistance * IMPOSTOR_FRACTION);
}

/**
 * Whether a crown grows a stem, which is the line between a palm and a fern.
 * Everything a stem brings — the bark piece, the collider, the impostor —
 * follows from this one test.
 */
export function hasStem(params: Params): boolean {
  return params.type === 'crown' && params.stemHeight > 0;
}

/**
 * Whether the emitted layer carries a billboard tier.
 *
 * A tree and a stemmed crown always do. Ground cover does only when the file
 * asks: a billboard stops being worth it the moment the model covers fewer
 * pixels than the tile has, and a 0.35m tuft is under that at any distance it
 * is still drawn at, so it culls instead, the way a pebble cluster does. A
 * three metre patch of plains grass is another matter, and sets one.
 */
export function hasImpostor(params: Params): boolean {
  return params.impostor !== null;
}

function validateTiers(params: Params): void {
  let previous = 0;
  const impostorAt = impostorDistance(params);

  // A stemless crown culls rather than coarsening, the way a clump does.
  if (params.type === 'crown' && !hasStem(params))
    throw new Error('lods need a stem: a stemless crown is ground cover and culls instead of coarsening.');

  params.lods.forEach((tier, index) => {
    if (tier.distance <= previous)
      throw new Error(`lods must ascend: tier ${index} at ${tier.distance}m does not follow ${previous}m.`);
    if (tier.distance >= impostorAt)
      throw new Error(
        `lods tier ${index} at ${tier.distance}m starts beyond the impostor at ${impostorAt}m. ` +
          `Move the tier in, or set impostor.fromDistance past it.`
      );
    previous = tier.distance;

    // The same bounds the model itself is held to.
    validate(tierParams(params, tier));
  });
}

function validate(params: Params): void {
  const positive = ['height', 'cullDistance', 'scaleMin'] as const;

  for (const key of positive)
    if (!(params[key] > 0)) throw new Error(`${key} must be positive, got ${params[key]}.`);

  if (params.scaleMax < params.scaleMin)
    throw new Error('scaleMax must not be below scaleMin.');

  if (params.footprint < 0) throw new Error(`footprint must not be negative, got ${params.footprint}.`);

  if (params.previewAngles !== 1 && params.previewAngles !== 4)
    throw new Error(`previewAngles must be 1 or 4, got ${params.previewAngles}.`);

  // The generated leaf image is a 4x4 grid, so a cell is a sixteenth of it.
  // Below 128 a cell is under 32 texels and there is no room to draw a leaf in
  // it. Anything that is not a power of two mips into a mess.
  //
  // 128 is a test size, not a shipping one. Nothing renders acceptably below
  // 512, and the default is 1024.
  if (params.textureSize < 128 || (params.textureSize & (params.textureSize - 1)) !== 0)
    throw new Error('textureSize must be a power of two of at least 128.');

  if (params.type === 'tree' || params.type === 'crown') {
    if (params.barkTextureSize !== 0 && (params.barkTextureSize < 128 || (params.barkTextureSize & (params.barkTextureSize - 1)) !== 0))
      throw new Error('barkTextureSize must be a power of two of at least 128, or 0 to follow textureSize.');
    validateBarkShape(params);
  }

  if (params.type === 'clump') validateClump(params);
  else if (params.type === 'crown') validateCrown(params);
  else if (params.type === 'rock') validateRock(params);
  else validateTree(params);

  if (params.impostor) validateImpostor(params.impostor, params.cullDistance);
}

/**
 * The bark map's shape.
 *
 * Its width is the long edge divided by the aspect, so raising the aspect buys
 * length rather than texels: the two axes of a bark map are not alike. x wraps
 * once around the ring and never repeats; y runs along the branch and repeats
 * every tile, which is the repetition you see on a trunk.
 */
function validateBarkShape(params: Params): void {
  if (params.barkAspect < 1 || (params.barkAspect & (params.barkAspect - 1)) !== 0)
    throw new Error(`barkAspect must be a power of two of at least 1, got ${params.barkAspect}.`);

  // Half the floor on the long edge, because that edge is already held to 128
  // and 128 is a test size rather than a shipping one. What this catches is an
  // aspect so tall that the ring has no texels left: at 64 a plate is under
  // four of them and the fissures merge into a smear.
  const size = barkTextureSize(params);
  if (size / params.barkAspect < 64)
    throw new Error(
      `${params.barkTextureSize ? 'barkTextureSize' : 'textureSize'} ${size} at barkAspect ${params.barkAspect} leaves the bark map ` +
        `${size / params.barkAspect}px around the ring. Raise it or lower barkAspect.`
    );
}

/** The bark map's long edge: its own key, or the set's size where that is 0. */
export function barkTextureSize(params: Params): number {
  return params.barkTextureSize || params.textureSize;
}

/** The generated bark map in texels: `barkAspect` times taller than it is wide. */
export function barkCanvasSize(params: Params): { width: number; height: number } {
  const size = barkTextureSize(params);
  return { width: size / params.barkAspect, height: size };
}

/** A stem is one branch, so it is held to the trunk's bounds; the rosette to a card's. */
function validateCrown(params: Params): void {
  if (params.stemHeight < 0) throw new Error(`stemHeight must not be negative, got ${params.stemHeight}.`);

  if (hasStem(params)) validateTube(params);

  if (params.crownBulge < 0) throw new Error(`crownBulge must not be negative, got ${params.crownBulge}.`);

  if (params.frondCount < 1 || params.frondCount > 48)
    throw new Error(`frondCount must be within 1..48, got ${params.frondCount}.`);

  if (!(params.frondLength > 0)) throw new Error(`frondLength must be positive, got ${params.frondLength}.`);

  if (params.frondAngle < -90 || params.frondAngle > 90)
    throw new Error(`frondAngle must be within -90..90, got ${params.frondAngle}.`);

  if (params.frondVariance < 0) throw new Error(`frondVariance must not be negative, got ${params.frondVariance}.`);

  if (params.frondSpan < 0 || params.frondSpan > 1)
    throw new Error(`frondSpan must be within 0..1, got ${params.frondSpan}.`);

  validateCards(params);
}

/** The bounds a card shares between a clump and a crown. */
function validateCards(params: Params): void {
  if (params.cardSegments < 1 || params.cardSegments > 12)
    throw new Error(`cardSegments must be within 1..12, got ${params.cardSegments}.`);

  if (!(params.cardAspect > 0)) throw new Error(`cardAspect must be positive, got ${params.cardAspect}.`);

  if (params.normalLean < 0) throw new Error(`normalLean must not be negative, got ${params.normalLean}.`);
}

/** The bounds a bark tube shares between a trunk and a stem. */
function validateTube(params: Params): void {
  validateTrunk(params);

  if (!(params.trunkRadius > 0)) throw new Error(`trunkRadius must be positive, got ${params.trunkRadius}.`);

  if (params.trunkTaper <= 0 || params.trunkTaper > 1)
    throw new Error('trunkTaper must be within 0..1.');

  if (params.radialSegments < 3 || params.radialSegments > 24)
    throw new Error('radialSegments must be within 3..24.');

  if (params.segments < 2 || params.segments > 32)
    throw new Error('segments must be within 2..32.');
}

/** Mirrors validateImpostor in the engine's ScatterLayers.ts, so a layer this
 *  prints is one the engine will accept. */
function validateImpostor(impostor: ScatterImpostor, cullDistance: number): void {
  if (impostor.fromDistance < 0)
    throw new Error(`impostor.fromDistance must not be negative, got ${impostor.fromDistance}.`);

  const impostorAt = impostor.fromDistance > 0 ? impostor.fromDistance : Math.round(cullDistance * IMPOSTOR_FRACTION);
  if (impostorAt >= cullDistance)
    throw new Error(`The impostor at ${impostorAt}m is not inside cullDistance ${cullDistance}m, so it would never draw.`);

  if (impostor.views < 2) throw new Error(`impostor.views must be at least 2, got ${impostor.views}.`);

  if (impostor.tileSize <= 0)
    throw new Error(`impostor.tileSize must be a positive number of pixels, got ${impostor.tileSize}.`);
}

/**
 * A tuft is a handful of cards on a point, so the only real bound is that it
 * has cards to draw and a footprint the placer can resolve.
 *
 * The floor on `footprint` is the engine's, not a preference: `Scatter.ts`
 * packs a cell coordinate into 12 bits per axis, and a 480m chunk at a 6cm
 * footprint already puts 4096 cells across it. Below that an instance exists
 * that no author could pluck.
 */
function validateClump(params: Params): void {
  // A patch is posed off one height sample and one slope sample, so its span is
  // bounded by what the terrain itself resolves: samples are 2m apart, and past
  // about four metres a patch is inventing relief the ground does not have.
  if (params.tuftsPerModel < 1 || params.tuftsPerModel > 64)
    throw new Error(`tuftsPerModel must be within 1..64, got ${params.tuftsPerModel}.`);

  if (params.patchRadius < 0) throw new Error(`patchRadius must not be negative, got ${params.patchRadius}.`);

  if (params.patchRadius > CLUMP_MAX_PATCH_RADIUS)
    throw new Error(
      `patchRadius ${params.patchRadius}m spans ${(params.patchRadius * 2).toFixed(1)}m, past the ${(
        CLUMP_MAX_PATCH_RADIUS * 2
      ).toFixed(1)}m the terrain resolves. Cut a second variant instead of one wider patch.`
    );

  if (params.cardsPerTuft < 1 || params.cardsPerTuft > 24)
    throw new Error(`cardsPerTuft must be within 1..24, got ${params.cardsPerTuft}.`);

  validateCards(params);

  if (params.cardSpread < 0) throw new Error(`cardSpread must not be negative, got ${params.cardSpread}.`);

  if (params.footprint > 0 && params.footprint < CLUMP_MIN_FOOTPRINT)
    throw new Error(
      `footprint ${params.footprint}m is below the ${CLUMP_MIN_FOOTPRINT}m the placer can address. ` +
        `Raise cardsPerTuft for a denser clump instead: candidate cost goes as 1 / footprint squared, card cost goes linearly.`
    );
}

/**
 * A rock's bounds. The subdivision ceiling is a triangle budget: 128 a side is
 * 196k triangles for one boulder.
 */
function validateRock(params: Params): void {
  if (params.width < 0) throw new Error(`width must not be negative, got ${params.width}.`);
  if (params.depth < 0) throw new Error(`depth must not be negative, got ${params.depth}.`);

  if (params.scoops < 0 || params.scoops > 24) throw new Error(`scoops must be within 0..24, got ${params.scoops}.`);

  if (params.scoopSize < 0.3 || params.scoopSize > 0.97)
    throw new Error(`scoopSize must be within 0.3..0.97, got ${params.scoopSize}.`);

  if (params.scoopDepth < 0 || params.scoopDepth > 0.6)
    throw new Error(`scoopDepth must be within 0..0.6, got ${params.scoopDepth}.`);

  // Past half the radius the noise folds the surface through the centre and
  // the rock stops being star-shaped, which is what the bake relies on.
  if (params.relief < 0 || params.relief > 0.5)
    throw new Error(`relief must be within 0..0.5, got ${params.relief}.`);


  if (!(params.reliefSize > 0)) throw new Error(`reliefSize must be positive, got ${params.reliefSize}.`);

  if (params.reliefOctaves < 1 || params.reliefOctaves > 8)
    throw new Error(`reliefOctaves must be within 1..8, got ${params.reliefOctaves}.`);

  if (params.plates < 0) throw new Error(`plates must not be negative, got ${params.plates}.`);

  if (params.plateLayers < 1 || params.plateLayers > 4)
    throw new Error(`plateLayers must be within 1..4, got ${params.plateLayers}.`);

  for (const key of ['plateBevel', 'plateLean', 'bedding', 'plateShare', 'plateTint'] as const)
    if (params[key] < 0 || params[key] > 1) throw new Error(`${key} must be within 0..1, got ${params[key]}.`);

  for (const key of ['smoothing', 'stain', 'veins', 'edgeWear', 'snow', 'topWash', 'topOpacity', 'streaks', 'patina', 'undulation', 'roughness', 'metallic', 'glint', 'vesicles', 'vesicleVary', 'vesicleStretch', 'vesicleZoning', 'vesicleDepth', 'amygdales'] as const)
    if (params[key] < 0 || params[key] > 1) throw new Error(`${key} must be within 0..1, got ${params[key]}.`);

  if (params.streakCount < 0 || params.streakCount > 100)
    throw new Error(`streakCount must be within 0..100, got ${params.streakCount}.`);

  if (params.cracks < 0) throw new Error(`cracks must not be negative, got ${params.cracks}.`);

  // A hole wider than this is a cave, and a cave needs an overhang the
  // star-shaped surface cannot hold.
  if (!(params.vesicleSize > 0) || params.vesicleSize > 0.5)
    throw new Error(`vesicleSize must be within 0..0.5 and above 0, got ${params.vesicleSize}.`);

  if (params.crackStrength < 0 || params.crackStrength > 1)
    throw new Error(`crackStrength must be within 0..1, got ${params.crackStrength}.`);

  if (params.grooveDepth < 0 || params.grooveDepth > 0.5)
    throw new Error(`grooveDepth must be within 0..0.5, got ${params.grooveDepth}.`);

  if (params.grooveWidth < 0 || params.grooveWidth > 1)
    throw new Error(`grooveWidth must be within 0..1, got ${params.grooveWidth}.`);

  if (params.weathering < 0 || params.weathering > 1)
    throw new Error(`weathering must be within 0..1, got ${params.weathering}.`);

  if (params.bump < 0 || params.bump > 4) throw new Error(`bump must be within 0..4, got ${params.bump}.`);

  for (const key of ['stoneTint', 'stoneDark', 'stoneLight', 'lichenTint', 'soilTint', 'stainTint', 'edgeTint', 'streakTint', 'topTint', 'glintTint', 'vesicleTint', 'amygdaleTint'] as const)
    if (!/^#?[0-9a-f]{6}$/i.test(params[key]))
      throw new Error(`${key} must be a six digit hex colour, got '${params[key]}'.`);

  if (!(params.toneSize > 0)) throw new Error(`toneSize must be positive, got ${params.toneSize}.`);

  if (params.toneOctaves < 1 || params.toneOctaves > 8)
    throw new Error(`toneOctaves must be within 1..8, got ${params.toneOctaves}.`);

  for (const key of ['toneContrast', 'speckle', 'crackDepth', 'crackWidth'] as const)
    if (params[key] < 0 || params[key] > 1) throw new Error(`${key} must be within 0..1, got ${params[key]}.`);

  if (!(params.grainScale > 0)) throw new Error(`grainScale must be positive, got ${params.grainScale}.`);

  if (!(params.glintScale > 0)) throw new Error(`glintScale must be positive, got ${params.glintScale}.`);

  if (!(params.undulationSize > 0))
    throw new Error(`undulationSize must be positive, got ${params.undulationSize}.`);

  if (params.subdivisions < ROCK_MIN_SUBDIVISIONS || params.subdivisions > 128)
    throw new Error(`subdivisions must be within ${ROCK_MIN_SUBDIVISIONS}..128, got ${params.subdivisions}.`);
}

/** Fewer than two quads a side leaves a cube with no vertex to displace. */
export const ROCK_MIN_SUBDIVISIONS = 2;

/** Below this the engine's kill-set runs out of cell bits. See validateClump. */
export const CLUMP_MIN_FOOTPRINT = 0.06;

/**
 * Half the widest patch worth growing, in metres.
 *
 * Terrain samples are 2m apart and a patch is posed off one of them, so a patch
 * wider than about four metres carries a conformance error the ground never
 * had. Two narrower variants beat one wide patch, and they break the repeat
 * as well.
 */
export const CLUMP_MAX_PATCH_RADIUS = 2.2;

/**
 * The bounds on a trunk's or a stem's own relief and its own detail.
 *
 * Every one of these is off at 0, and 0 is the default, so a tree that does not
 * ask for a shaped trunk is the plain tube it always was.
 */
function validateTrunk(params: Params): void {
  // Past half the radius the grooves of one side meet those of the other.
  if (params.trunkFlute < 0 || params.trunkFlute > 0.5)
    throw new Error(`trunkFlute must be within 0..0.5, got ${params.trunkFlute}.`);

  if (params.trunkFlare < 0) throw new Error(`trunkFlare must not be negative, got ${params.trunkFlare}.`);

  if (params.trunkWander < 0) throw new Error(`trunkWander must not be negative, got ${params.trunkWander}.`);

  // The same bounds the branch tube is held to, plus 0 for "take the branch's".
  if (params.trunkSides !== 0 && (params.trunkSides < 3 || params.trunkSides > 48))
    throw new Error(`trunkSides must be 0, or within 3..48, got ${params.trunkSides}.`);

  if (params.trunkSegments !== 0 && (params.trunkSegments < 2 || params.trunkSegments > 64))
    throw new Error(`trunkSegments must be 0, or within 2..64, got ${params.trunkSegments}.`);

}

/**
 * A flute is a fold in the ring, and a ring of 8 has no room to fold, so asking
 * for one on a tube that coarse is a key that silently does nothing.
 *
 * The model is held to this and its tiers are not. A tier that drops its sides
 * is coarsening on purpose, and a flute that goes blocky at 90m is the trade it
 * was asking for.
 */
function validateTrunkDetail(params: Params): void {
  if (params.trunkFlute > 0 && trunkSidesOf(params) < TRUNK_FLUTE_SIDES)
    throw new Error(
      `trunkFlute ${params.trunkFlute} needs a rounder trunk than ${trunkSidesOf(params)} sides to cut into. ` +
        `Set trunkSides to ${TRUNK_FLUTE_SIDES} or more.`
    );
}

/** Sides below which a groove has nothing to be a groove in. */
export const TRUNK_FLUTE_SIDES = 12;

/** Sides of the trunk tube: its own, else the branch tube's. */
export function trunkSidesOf(params: Params): number {
  return params.trunkSides > 0 ? params.trunkSides : Math.max(3, params.radialSegments);
}

/** Rings up the trunk: its own, else two more than a branch gets. */
export function trunkRingsOf(params: Params): number {
  return params.trunkSegments > 0 ? params.trunkSegments : params.segments + 2;
}

/**
 * Branches in the deepest generation, which is what the branch cap is read
 * against.
 *
 * A fork tree reaches `splits ^ branchLevels`. A whorl tree starts from
 * `whorls x splits` limbs rather than from `splits`, so every generation below
 * is that many times wider and the cap has to see the whorl count.
 */
export function deepestGeneration(params: Params): number {
  const forked = params.splits ** params.branchLevels;
  return params.branchModel === 'whorl' && params.branchLevels > 0 ? forked * params.whorls : forked;
}

function validateTree(params: Params): void {
  const positive = ['lengthRatio', 'radiusRatio', 'leafSize'] as const;

  for (const key of positive)
    if (!(params[key] > 0)) throw new Error(`${key} must be positive, got ${params[key]}.`);

  validateTube(params);

  if (params.splits < 1 || params.splits > 12)
    throw new Error('splits must be within 1..12.');

  // Branch count is splits^levels, so a deep high-split tree is a vertex bomb
  // that only shows up as a multi-second run and a 40MB file.
  if (params.branchLevels < 0 || params.branchLevels > 6)
    throw new Error('branchLevels must be within 0..6.');

  validateTrunk(params);

  if (!(BRANCH_MODELS as readonly string[]).includes(params.branchModel))
    throw new Error(`branchModel must be one of ${BRANCH_MODELS.join(', ')}, got '${params.branchModel}'.`);

  if (params.branchModel === 'whorl') {
    // One whorl is a single ring of limbs, which is a shape the fork model
    // already reaches. The ceiling is the branch cap below, reached through
    // the limb count rather than stated twice.
    if (params.whorls < 1 || params.whorls > 24)
      throw new Error(`whorls must be within 1..24, got ${params.whorls}.`);

    // At 0 the top whorl has no length and the spire ends in nothing. Past 1
    // the tree widens as it climbs, which is an inverted cone and not a
    // conifer: use the fork model for that.
    if (!(params.whorlTaper > 0) || params.whorlTaper > 1)
      throw new Error(`whorlTaper must be within 0..1, got ${params.whorlTaper}.`);
  }

  if (deepestGeneration(params) > 4096)
    throw new Error(
      `splits ${params.splits} at branchLevels ${params.branchLevels}` +
        (params.branchModel === 'whorl' ? ` over ${params.whorls} whorls` : '') +
        ` is ${deepestGeneration(params)} branches. Lower one of them.`
    );

  if (params.barkLevels < 0 || params.barkLevels > 6)
    throw new Error('barkLevels must be within 0..6.');

  if (!(params.leafScale > 0)) throw new Error(`leafScale must be positive, got ${params.leafScale}.`);

  if (![0, 1, 2, 4].includes(params.leafGrid))
    throw new Error(`leafGrid must be 1, 2 or 4, or 0 to derive it, got ${params.leafGrid}.`);

  if (params.leavesPerBranch < 0) throw new Error('leavesPerBranch must not be negative.');

  if (params.leafEvenness < 0 || params.leafEvenness > 1)
    throw new Error(`leafEvenness must be within 0..1, got ${params.leafEvenness}.`);

  // Leaves hang off the deepest generations, so asking for more of them than
  // the tree has produces a trunk covered in foliage.
  if (params.leafLevels < 1 || params.leafLevels > params.branchLevels + 1)
    throw new Error(
      `leafLevels must be within 1..${params.branchLevels + 1} at branchLevels ${params.branchLevels}.`
    );

  if (!['card', 'canopy', 'up'].includes(params.leafNormalMode))
    throw new Error(`leafNormalMode must be card, canopy or up, got '${params.leafNormalMode}'.`);
}

/**
 * The options whose value decides what the texture files contain.
 *
 * Short now that the look is settled: the seed, the profile, the resolution
 * and the card size an authored leaf is fitted to, which is why a mesh edit
 * almost always reuses the images it built last time.
 */
export function textureKeys(type: ForgeType): (keyof typeof PARAM_SPEC)[] {
  return (Object.entries(PARAM_SPEC) as [keyof typeof PARAM_SPEC, ParamSpec][])
    .filter(([, spec]) => spec.texture === true || (Array.isArray(spec.texture) && spec.texture.includes(type)))
    .map(([key]) => key);
}

/** Whether two parameter sets would produce the same texture files. Of an
 *  accent only its stamps reach the image; the rest moves cards. */
export function sameTexture(a: Params, b: Params): boolean {
  const seen = (params: Params, key: keyof typeof PARAM_SPEC): unknown =>
    key === 'accents' ? params.accents.map((accent) => accent.stamps) : params[key];
  return a.type === b.type && textureKeys(a.type).every((key) => JSON.stringify(seen(a, key)) === JSON.stringify(seen(b, key)));
}

export function helpText(): string {
  const rows = Object.entries(PARAM_SPEC).map(([key, spec]: [string, ParamSpec]) => {
    const shown = spec.default === null ? '' : JSON.stringify(spec.default);
    const owners = spec.types ? ` [${spec.types.join('|')}]` : '';
    const byType = spec.byType
      ? ` (${Object.entries(spec.byType)
          .map(([type, value]) => `${type} ${JSON.stringify(value)}`)
          .join(', ')})`
      : '';
    return `  ${key.padEnd(18)} ${shown.padEnd(14)} ${spec.help}${owners}${byType}`;
  });

  return [
    'scatter-forge — procedural scatter assets for the Understory scatter system',
    '',
    'Usage: node tools/scatter-forge/cli.ts <config.json> [--watch] [--write-template[=<path>]]',
    '',
    'Every option is a key of the file. Start from a preset in tools/scatter-forge/templates/.',
    '--watch rebuilds whenever the file is saved.',
    '--write-template patches the layer into templatesDir/scatter-layers.json and the',
    'geometry into geometries.json beside it, on every build. =<path> names another file.',
    '',
    `Types: ${FORGE_TYPES.join(', ')}. A key marked [type] belongs to that type alone,`,
    'and setting it on another is an error naming the type that takes it.',
    '',
    'Keys and defaults:',
    ...rows,
    '',
  ].join('\n');
}
