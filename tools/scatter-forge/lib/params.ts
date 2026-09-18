// The generator's whole input surface: the keys of a tree.json. The resolved
// set is written next to the model as its sidecar, so a variant can be
// regenerated or nudged from the file that made it.

import type { ScatterImpostor } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { LOOK, retiredKeys } from './look.ts';
import { FORGE_TYPES, isForgeType, type ForgeType } from './pieces.ts';
import { hashString } from './rng.ts';

type Default = string | number | boolean | readonly string[] | readonly LodTier[] | ScatterImpostor | null;

interface ParamSpec {
  readonly type: 'string' | 'number' | 'int' | 'flag' | 'list' | 'tiers' | 'impostor';
  readonly default: Default;
  readonly help: string;
  /** Changing this changes the texture files. Everything else only moves the
   *  mesh, which costs a thousandth as much to rebuild. */
  readonly texture?: boolean;
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
/** The types that grow a bark tube. */
const WOODY = ['tree', 'crown'] as const;
/** The types whose cutout is a segmented card. */
const CARDED = ['clump', 'crown'] as const;
/** The types whose `height` is a finished height. A crown is two lengths instead. */
const SIZED = ['tree', 'clump'] as const;

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
] as const;

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
    byType: { clump: 'assets/shared/nature/clumps', crown: 'assets/shared/nature/crowns' },
    help: 'Directory the model and textures are written to.',
  },
  assetsRoot: { type: 'string', default: 'assets/shared', help: 'Root the template urls are made relative to.' },
  seed: { type: 'int', default: null, help: 'Every random choice. Omit it and the CLI rolls a new model each run.', texture: true },

  height: {
    type: 'number',
    default: 12,
    byType: { clump: 0.35 },
    help: 'Finished height in metres. A tree normalises its skeleton to it; a clump sizes its cards to reach it.',
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
  leafSize: { type: 'number', default: 1, help: 'Leaf card height in metres. Decides how many authored leaves fill a card.', texture: true, types: TREE },
  leafGrid: { type: 'int', default: 0, help: 'Cells along each edge of the leaf image: 1, 2 or 4. Fewer cells give each cluster more texels; more give the canopy more variants. 0 derives it from how many leaves fit a card.', texture: true, types: TREE },
  leafScale: { type: 'number', default: 1, help: 'Card size multiplier that leaves the texture fit alone. Fewer, larger cards for a LOD tier.', types: TREE },
  leafAspect: { type: 'number', default: 0.85, help: 'Leaf card width as a fraction of its height.', types: TREE },
  leafDroop: { type: 'number', default: 55, help: 'Degrees a leaf card hangs below its branch direction.', types: TREE },
  leafFrom: { type: 'number', default: 0.15, help: 'Fraction along a tip branch that leaves start at.', types: TREE },
  leafNormalMode: { type: 'string', default: 'canopy', help: 'card | canopy | up. How leaf normals are authored.', types: TREE },
  leafAlphaCutoff: { type: 'number', default: 0.45, byType: { clump: 0.4 }, help: 'glTF alphaCutoff on every cutout piece.' },

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

  bendCurve: {
    type: 'number',
    default: 1.6,
    byType: { clump: 1 },
    help: 'Exponent shaping COLOR_0.r. Higher keeps the base rigid for longer. A blade bends along its whole length, so a clump wants 1.',
  },

  lods: { type: 'tiers', default: [], help: 'Coarser tiers, nearest first: [{ distance, radialSegments?, barkLevels?, leavesPerBranch?, leafScale?, cardSegments? }]. Each override must be a key of the type.', types: WOODY },

  windAmplitude: { type: 'number', default: 0.4, help: 'ScatterWind amplitude for the emitted layer.', byType: { clump: 0.18 } },
  windFrequency: { type: 'number', default: 0.45, help: 'ScatterWind frequency for the emitted layer.', byType: { clump: 1.1 } },
  windFlutter: { type: 'number', default: 0.35, help: 'ScatterWind flutter for the emitted layer.', byType: { clump: 0.7 } },
  cullDistance: { type: 'number', default: 160, help: 'ScatterLayer cullDistance for the emitted layer.', byType: { clump: 50 } },
  castShadow: { type: 'flag', default: true, byType: { clump: false, crown: null }, help: 'Draw the emitted layer into the shadow maps. A clump defaults off; a crown casts while it has a stem.' },
  impostor: { type: 'impostor', default: IMPOSTOR_DEFAULT, byType: { clump: null, crown: null }, help: "The layer's impostor block, keyed as the layer keys it: { fromDistance, views, tileSize }. fromDistance 0 derives it from cullDistance; views is per axis, at least 2; tileSize is in pixels. A clump or a stemless crown bakes one only if the file sets it." },
  footprint: { type: 'number', default: 0, help: 'ScatterLayer footprint in metres. 0 derives it from the model. The most expensive number here: candidates go as 1/footprint squared.', byType: { clump: 0.7 } },
  scaleMin: { type: 'number', default: 0.8, byType: { clump: 0.75 }, help: 'Lower bound of the emitted scale jitter.' },
  scaleMax: { type: 'number', default: 1.25, help: 'Upper bound of the emitted scale jitter.', byType: { clump: 1.3 } },

  textureSize: { type: 'int', default: 1024, byType: { clump: 2048, crown: 2048 }, help: 'Edge of the square texture template, and the long edge of the bark one; an authored bark keeps its shape and is reduced to fit. A clump or frond atlas holds every stamp, so it starts larger.', texture: true },
  barkTextureSize: { type: 'int', default: 0, help: 'Long edge of the bark map in pixels, so the bark and the leaf atlas can differ. 0 follows textureSize.', texture: true, types: WOODY },
  barkAspect: { type: 'int', default: 2, help: 'How many times taller than wide the bark map is, and how many circumferences of branch one tile covers. 1 is square.', texture: true, types: WOODY },
  preview: { type: 'int', default: 0, help: 'Write a shaded preview PNG at this pixel size. 0 writes none.' },
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
  Record<keyof typeof PARAM_SPEC, string | number | boolean | string[] | LodTier[] | Partial<ScatterImpostor>>
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

  return saved;
}

export function resolveParams(raw: RawConfig): Params {
  const modelType = typeOf(raw, 'This config');

  // Built dynamically because the loop walks the table, then asserted once. The
  // mapped type above is what every reader is checked against.
  const params: Record<string, string | number | boolean | string[] | LodTier[] | ScatterImpostor | null> = {};

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
        ? ([...fallback] as string[] | LodTier[])
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
      if (!/^[a-z0-9][a-z0-9-]*(\/[A-Za-z0-9_*?-]+)?$/.test(entry))
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
 * is still drawn at, so it culls instead, the way `granite_pebble` does. A
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

  // The generated leaf image is a 4x4 grid, so a cell is a sixteenth of it.
  // Below 128 a cell is under 32 texels and there is no room to draw a leaf in
  // it. Anything that is not a power of two mips into a mess.
  //
  // 128 is a test size, not a shipping one. Nothing renders acceptably below
  // 512, and the default is 1024.
  if (params.textureSize < 128 || (params.textureSize & (params.textureSize - 1)) !== 0)
    throw new Error('textureSize must be a power of two of at least 128.');

  if (params.type !== 'clump') {
    if (params.barkTextureSize !== 0 && (params.barkTextureSize < 128 || (params.barkTextureSize & (params.barkTextureSize - 1)) !== 0))
      throw new Error('barkTextureSize must be a power of two of at least 128, or 0 to follow textureSize.');
    validateBarkShape(params);
  }

  if (params.type === 'clump') validateClump(params);
  else if (params.type === 'crown') validateCrown(params);
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
export function textureKeys(): (keyof typeof PARAM_SPEC)[] {
  return (Object.entries(PARAM_SPEC) as [keyof typeof PARAM_SPEC, ParamSpec][])
    .filter(([, spec]) => spec.texture)
    .map(([key]) => key);
}

/** Whether two parameter sets would produce the same texture files. */
export function sameTexture(a: Params, b: Params): boolean {
  return textureKeys().every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
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
