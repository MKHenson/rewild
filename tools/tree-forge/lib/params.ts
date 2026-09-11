// The generator's whole input surface: the keys of a tree.json. The resolved
// set is written next to the model as its sidecar, so a variant can be
// regenerated or nudged from the file that made it.

import { profileNames } from './bark.ts';
import { LOOK, retiredKeys } from './look.ts';
import { hashString } from './rng.ts';

interface ParamSpec {
  readonly type: 'string' | 'number' | 'int' | 'flag' | 'list';
  readonly default: string | number | boolean | readonly string[] | null;
  readonly help: string;
  /** Changing this changes the texture files. Everything else only moves the
   *  mesh, which costs a thousandth as much to rebuild. */
  readonly texture?: boolean;
}

export const PARAM_SPEC = {
  name: { type: 'string', default: null, help: 'Model id. Names the .glb and the geometry template.' },
  textureSet: { type: 'string', default: null, help: 'Texture set to write or reference. Defaults to name. Share one across variants.' },
  bark: { type: 'list', default: [], help: 'Folders under sources/bark the bark image is assembled from. Empty generates it.', texture: true },
  leaves: { type: 'list', default: [], help: 'Folders under sources/leaves whose stamps fill the leaf image. Empty generates it.', texture: true },
  out: { type: 'string', default: 'assets/shared/nature/trees', help: 'Directory the model and textures are written to.' },
  assetsRoot: { type: 'string', default: 'assets/shared', help: 'Root the template urls are made relative to.' },
  seed: { type: 'int', default: null, help: 'Placement seed. Defaults to a hash of name.', texture: true },

  height: { type: 'number', default: 12, help: 'Total tree height in metres. The skeleton is normalised to it.' },
  trunkRadius: { type: 'number', default: 0.32, help: 'Trunk radius at the base, in metres.' },
  trunkTaper: { type: 'number', default: 0.22, help: 'Trunk radius at the top as a fraction of the base.' },
  splits: { type: 'int', default: 3, help: 'Child branches per split.' },
  splitAngle: { type: 'number', default: 38, help: 'Degrees a child leaves its parent by.' },
  splitVariance: { type: 'number', default: 12, help: 'Random degrees added to each split angle.' },
  splitSpread: { type: 'number', default: 0.35, help: 'Fraction of the parent the splits are spread back along from its tip.' },
  branchLevels: { type: 'int', default: 4, help: 'Branch generations below the trunk.' },
  lengthRatio: { type: 'number', default: 0.62, help: 'Child length as a fraction of its parent.' },
  radiusRatio: { type: 'number', default: 0.6, help: 'Child radius as a fraction of its parent at the attach point.' },
  curve: { type: 'number', default: 14, help: 'Total degrees a branch bends along its own length.' },
  droop: { type: 'number', default: 16, help: 'Degrees the deepest branches bend toward the ground. Negative bends them back upright.' },
  segments: { type: 'int', default: 5, help: 'Rings along each branch.' },
  radialSegments: { type: 'int', default: 8, help: 'Sides of the trunk tube. Deeper branches use fewer.' },

  leavesPerBranch: { type: 'int', default: 18, help: 'Leaf cards on each leaf-bearing branch.' },
  leafLevels: { type: 'int', default: 2, help: 'How many of the deepest branch generations carry leaves.' },
  leafSize: { type: 'number', default: 1, help: 'Leaf card height in metres. Decides how many authored leaves fill a card.', texture: true },
  leafAspect: { type: 'number', default: 0.85, help: 'Leaf card width as a fraction of its height.' },
  leafDroop: { type: 'number', default: 55, help: 'Degrees a leaf card hangs below its branch direction.' },
  leafFrom: { type: 'number', default: 0.15, help: 'Fraction along a tip branch that leaves start at.' },
  leafNormalMode: { type: 'string', default: 'canopy', help: 'card | canopy | up. How leaf normals are authored.' },
  leafAlphaCutoff: { type: 'number', default: 0.45, help: 'glTF alphaCutoff on the leaf material.' },

  bendCurve: { type: 'number', default: 1.6, help: 'Exponent shaping COLOR_0.r. Higher keeps the trunk base rigid for longer.' },

  windAmplitude: { type: 'number', default: 0.4, help: 'ScatterWind amplitude for the emitted layer.' },
  windFrequency: { type: 'number', default: 0.45, help: 'ScatterWind frequency for the emitted layer.' },
  windFlutter: { type: 'number', default: 0.35, help: 'ScatterWind flutter for the emitted layer.' },
  cullDistance: { type: 'number', default: 160, help: 'ScatterLayer cullDistance for the emitted layer.' },
  footprint: { type: 'number', default: 0, help: 'ScatterLayer footprint. 0 derives it from the canopy radius.' },
  scaleMin: { type: 'number', default: 0.8, help: 'Lower bound of the emitted scale jitter.' },
  scaleMax: { type: 'number', default: 1.25, help: 'Upper bound of the emitted scale jitter.' },

  barkProfile: { type: 'string', default: 'oak', help: 'Which bark layer stack to build. oak | smooth.', texture: true },
  textureSize: { type: 'int', default: 1024, help: 'Edge of the square texture template.', texture: true },
  preview: { type: 'int', default: 0, help: 'Write a shaded preview PNG at this pixel size. 0 writes none.' },
  skipTextures: { type: 'flag', default: false, help: 'Reuse an existing texture set rather than writing one.' },
  writeTemplates: { type: 'flag', default: false, help: 'Patch geometries.json and materials.json in place.' },
  templatesDir: { type: 'string', default: 'templates', help: 'Directory holding geometries.json and materials.json.' },
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
    : number;
};

/**
 * The options, plus the settled look values from `look.ts`. Those are fields
 * here and not flags: nothing asks for them, everything reads them, and a test
 * can still build a variant by overriding one on the object.
 */
export type Params = Options & { -readonly [K in keyof typeof LOOK]: (typeof LOOK)[K] extends string ? string : number };

/** What a tree.json holds, before defaults and validation. */
export type RawConfig = Partial<Record<keyof typeof PARAM_SPEC, string | number | boolean | string[]>>;

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
export function parseConfig(config: unknown, source: string): RawConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${source} must hold a JSON object.`);

  const out: RawConfig = {};

  for (const [key, value] of Object.entries(config)) {
    if (value === null || value === undefined) continue;

    // A sidecar written before a key was retired still opens, without that
    // value doing anything. Erroring would strand every tree.json on disk.
    if (retiredKeys().includes(key)) continue;

    if (!isParamKey(key)) throw new Error(`${source} has an unknown option '${key}'.`);

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

/** The parameters as they are written beside the model, ready to be edited. */
export function toConfig(params: Params): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...params };
  // The settled look values are not input, so they are not written back. A file
  // that still carries them from before keeps opening; it just loses them on
  // the next save.
  for (const key of retiredKeys()) delete saved[key];
  return saved;
}

export function resolveParams(raw: RawConfig): Params {
  // Built dynamically because the loop walks the table, then asserted once. The
  // mapped type above is what every reader is checked against.
  const params: Record<string, string | number | boolean | string[] | null> = {};

  for (const [key, spec] of Object.entries(PARAM_SPEC) as [
    keyof typeof PARAM_SPEC,
    ParamSpec
  ][]) {
    const value = raw[key];

    if (value === undefined || value === null) {
      params[key] = spec.type === 'list' ? [...(spec.default as readonly string[])] : (spec.default as string | number | boolean | null);
      continue;
    }

    if (spec.type === 'list') {
      if (!Array.isArray(value)) throw new Error(`Option '${key}' must be a list of source names.`);
      params[key] = [...value];
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
  for (const key of ['bark', 'leaves'] as const)
    for (const entry of params[key] as string[])
      if (!/^[a-z0-9][a-z0-9-]*$/.test(entry))
        throw new Error(`${key} source '${entry}' must be lowercase, digits and hyphens.`);

  params.seed ??= hashString(name);

  const resolved = { ...params, ...LOOK } as Params;
  validate(resolved);
  return resolved;
}

function validate(params: Params): void {
  const positive = [
    'height',
    'trunkRadius',
    'lengthRatio',
    'radiusRatio',
    'leafSize',
    'cullDistance',
    'scaleMin',
  ] as const;

  for (const key of positive)
    if (!(params[key] > 0)) throw new Error(`${key} must be positive, got ${params[key]}.`);

  if (params.trunkTaper <= 0 || params.trunkTaper > 1)
    throw new Error('trunkTaper must be within 0..1.');

  if (params.splits < 1 || params.splits > 12)
    throw new Error('splits must be within 1..12.');

  // Branch count is splits^levels, so a deep high-split tree is a vertex bomb
  // that only shows up as a multi-second run and a 40MB file.
  if (params.branchLevels < 0 || params.branchLevels > 6)
    throw new Error('branchLevels must be within 0..6.');

  if (params.splits ** params.branchLevels > 4096)
    throw new Error(
      `splits ${params.splits} at branchLevels ${params.branchLevels} is ${params.splits ** params.branchLevels} branches. Lower one of them.`
    );

  if (params.radialSegments < 3 || params.radialSegments > 24)
    throw new Error('radialSegments must be within 3..24.');

  if (params.segments < 2 || params.segments > 32)
    throw new Error('segments must be within 2..32.');

  if (params.scaleMax < params.scaleMin)
    throw new Error('scaleMax must not be below scaleMin.');

  // Leaves hang off the deepest generations, so asking for more of them than
  // the tree has produces a trunk covered in foliage.
  if (params.leafLevels < 1 || params.leafLevels > params.branchLevels + 1)
    throw new Error(
      `leafLevels must be within 1..${params.branchLevels + 1} at branchLevels ${params.branchLevels}.`
    );

  if (!profileNames().includes(params.barkProfile))
    throw new Error(
      `barkProfile must be one of ${profileNames().join(', ')}, got '${params.barkProfile}'.`
    );

  if (!['card', 'canopy', 'up'].includes(params.leafNormalMode))
    throw new Error(`leafNormalMode must be card, canopy or up, got '${params.leafNormalMode}'.`);

  // The generated leaf image is a 4x4 grid, so a cell is a sixteenth of it.
  // Below 128 a cell is under 32 texels and there is no room to draw a leaf in
  // it. Anything that is not a power of two mips into a mess.
  //
  // 128 is a test size, not a shipping one. Nothing renders acceptably below
  // 512, and the default is 1024.
  if (params.textureSize < 128 || (params.textureSize & (params.textureSize - 1)) !== 0)
    throw new Error('textureSize must be a power of two of at least 128.');
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
    return `  ${key.padEnd(18)} ${shown.padEnd(30)} ${spec.help}`;
  });

  return [
    'tree-forge — procedural trees for the Understory scatter system',
    '',
    'Usage: node tools/tree-forge/cli.ts <tree.json> [--watch]',
    '',
    'Every option is a key of the file. Start from a preset in tools/tree-forge/templates/.',
    '--watch rebuilds whenever the file is saved.',
    '',
    'Keys and defaults:',
    ...rows,
    '',
  ].join('\n');
}
