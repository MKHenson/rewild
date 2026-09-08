// The generator's whole input surface. Every field is a CLI flag, and the set
// is written next to the model as tree.json so a variant can be regenerated or
// nudged without remembering the command line.

import { hashString } from './rng.ts';

interface ParamSpec {
  readonly type: 'string' | 'number' | 'int' | 'flag';
  readonly default: string | number | boolean | null;
  readonly help: string;
  /** Changing this changes the texture files. Everything else only moves the
   *  mesh, which costs a thousandth as much to rebuild. */
  readonly texture?: boolean;
}

export const PARAM_SPEC = {
  config: { type: 'string', default: null, help: 'A tree.json to read every option from. Command line options still win.' },
  name: { type: 'string', default: null, help: 'Model id. Names the .glb and the geometry template.' },
  textureSet: { type: 'string', default: null, help: 'Texture family to reference. Defaults to --name. Share one across variants.' },
  out: { type: 'string', default: 'assets/shared/nature/trees', help: 'Directory the model and textures are written to.' },
  assetsRoot: { type: 'string', default: 'assets/shared', help: 'Root the template urls are made relative to.' },
  seed: { type: 'int', default: null, help: 'Placement seed. Defaults to a hash of --name.', texture: true },

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
  leafSize: { type: 'number', default: 1, help: 'Leaf card height in metres.' },
  leafAspect: { type: 'number', default: 0.85, help: 'Leaf card width as a fraction of its height.' },
  leafDroop: { type: 'number', default: 55, help: 'Degrees a leaf card hangs below its branch direction.' },
  leafFrom: { type: 'number', default: 0.15, help: 'Fraction along a tip branch that leaves start at.' },
  leafNormalMode: { type: 'string', default: 'canopy', help: 'card | canopy | up. How leaf normals are authored.' },
  leafAlphaCutoff: { type: 'number', default: 0.45, help: 'glTF alphaCutoff on the leaf material.' },

  barkTile: { type: 'number', default: 2.2, help: "Metres of trunk per bark texture repeat, scaled down on thinner branches. Writes the model's UVs, not the texture." },
  bendCurve: { type: 'number', default: 1.6, help: 'Exponent shaping COLOR_0.r. Higher keeps the trunk base rigid for longer.' },

  windAmplitude: { type: 'number', default: 0.4, help: 'ScatterWind amplitude for the emitted layer.' },
  windFrequency: { type: 'number', default: 0.45, help: 'ScatterWind frequency for the emitted layer.' },
  windFlutter: { type: 'number', default: 0.35, help: 'ScatterWind flutter for the emitted layer.' },
  cullDistance: { type: 'number', default: 160, help: 'ScatterLayer cullDistance for the emitted layer.' },
  footprint: { type: 'number', default: 0, help: 'ScatterLayer footprint. 0 derives it from the canopy radius.' },
  scaleMin: { type: 'number', default: 0.8, help: 'Lower bound of the emitted scale jitter.' },
  scaleMax: { type: 'number', default: 1.25, help: 'Upper bound of the emitted scale jitter.' },

  barkTint: { type: 'string', default: '#6b5541', help: 'Base bark colour, six digit hex.', texture: true },
  leafTint: { type: 'string', default: '#4e7c33', help: 'Base leaf colour, six digit hex.', texture: true },
  barkPlates: { type: 'number', default: 14, help: 'Bark plates around the tube. Fewer means broader slabs.', texture: true },
  knots: { type: 'number', default: 0.3, help: 'How often a knot appears, 0..1, over a fixed grid of bark cells. 0 writes none.', texture: true },
  knotSize: { type: 'number', default: 0.42, help: 'Knot radius as a fraction of a bark cell.', texture: true },
  knotDepth: { type: 'number', default: 0.75, help: 'How strongly a knot deforms the bark around it, 0..1.', texture: true },
  grooveWidth: { type: 'number', default: 0.11, help: 'How wide a fissure between two bark plates is, in cell units.', texture: true },
  grooveDepth: { type: 'number', default: 0.26, help: 'How far a fissure cuts, which also decides how dark it goes. 0 leaves the plates joined.', texture: true },
  grooveShade: { type: 'number', default: 0.5, help: 'Colour at the bottom of a fissure as a fraction of the plate colour. Higher is lighter.', texture: true },
  colourPatches: { type: 'int', default: 5, help: 'Colour patches around the tube. Fewer means broader blotches.', texture: true },
  colourVariation: { type: 'number', default: 0.18, help: 'How far colour drifts along the warm-to-cool axis. 0 leaves one flat hue.', texture: true },
  roughnessVariation: { type: 'number', default: 0.13, help: 'Low frequency variation in the roughness channel. 0 makes gloss a pure function of depth.', texture: true },
  lichen: { type: 'number', default: 0.3, help: 'Lichen coverage on the bark, 0..1. 0 writes none.', texture: true },
  lichenTint: { type: 'string', default: '#93a17a', help: 'Lichen colour, six digit hex.', texture: true },
  curvature: { type: 'number', default: 0.55, help: 'How much the curvature of the height template darkens crevices and bleaches ridges. 0 disables it.', texture: true },
  leafSerration: { type: 'number', default: 0.32, help: 'How far a leaflet edge is eaten into lobes. 0 is a smooth ellipse.', texture: true },
  bumpStrength: { type: 'number', default: 2.2, help: 'Gradient gain used to turn the height template into a normal map.', texture: true },
  textureSize: { type: 'int', default: 1024, help: 'Edge of the square texture template.', texture: true },
  preview: { type: 'int', default: 0, help: 'Write a shaded preview PNG at this pixel size. 0 writes none.' },
  watch: { type: 'flag', default: false, help: 'Rebuild whenever the config file is saved. Needs --config.' },
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
export type Params = {
  -readonly [K in keyof typeof PARAM_SPEC]: (typeof PARAM_SPEC)[K]['type'] extends 'flag'
    ? boolean
    : (typeof PARAM_SPEC)[K]['type'] extends 'string'
    ? string
    : number;
};

/**
 * Whatever came off the command line or out of a config, before defaults and
 * validation. Numbers are allowed because a config carries resolved values,
 * where the command line only ever carries text.
 */
export type RawArgs = Partial<Record<keyof typeof PARAM_SPEC, string | number | boolean>>;

function toCamel(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function isParamKey(key: string): key is keyof typeof PARAM_SPEC {
  return key in PARAM_SPEC;
}

export function parseArgs(argv: string[]): RawArgs {
  const raw: RawArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument '${token}'.`);

    const [flag, inline] = token.slice(2).split('=');
    const key = toCamel(flag);
    if (!isParamKey(key)) throw new Error(`Unknown option '--${flag}'.`);
    const spec: ParamSpec = PARAM_SPEC[key];

    if (spec.type === 'flag') {
      raw[key] = inline === undefined ? true : inline !== 'false';
      continue;
    }

    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`Option '--${flag}' needs a value.`);
    raw[key] = value;
  }

  return raw;
}

/**
 * Turns a parsed tree.json into argument overrides.
 *
 * Rejects an unknown key rather than ignoring it, because the whole point of
 * the file is to be hand-edited, and a silently dropped typo is a change that
 * appears not to have worked.
 */
export function argsFromConfig(config: unknown, source: string): RawArgs {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${source} must hold a JSON object.`);

  const out: RawArgs = {};

  for (const [key, value] of Object.entries(config)) {
    // A sidecar written by a --config run names itself. Harmless, and not worth
    // making the user delete it.
    if (key === 'config' || value === null || value === undefined) continue;

    if (!isParamKey(key)) throw new Error(`${source} has an unknown option '${key}'.`);

    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new Error(`${source} option '${key}' must be a string, number or boolean.`);

    out[key] = value;
  }

  return out;
}

/** The parameters as they are written beside the model, ready to be edited. */
export function toConfig(params: Params): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...params };
  delete saved.config;
  return saved;
}

export function resolveParams(raw: RawArgs): Params {
  // Built dynamically because the loop walks the table, then asserted once. The
  // mapped type above is what every reader is checked against.
  const params: Record<string, string | number | boolean | null> = {};

  for (const [key, spec] of Object.entries(PARAM_SPEC) as [
    keyof typeof PARAM_SPEC,
    ParamSpec
  ][]) {
    const value = raw[key];

    if (value === undefined || value === null) {
      params[key] = spec.default;
      continue;
    }

    if (spec.type === 'number' || spec.type === 'int') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`Option '--${key}' must be a number, got '${value}'.`);
      params[key] = spec.type === 'int' ? Math.round(parsed) : parsed;
      continue;
    }

    params[key] = spec.type === 'flag' ? !!value : String(value);
  }

  const name = params.name;
  if (typeof name !== 'string' || !name) throw new Error('--name is required.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error(`--name '${name}' must be lowercase, digits and hyphens: it becomes a filename and a template key.`);

  params.textureSet ??= name;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(params.textureSet)))
    throw new Error(`--texture-set '${params.textureSet}' must be lowercase, digits and hyphens.`);

  params.seed ??= hashString(name);

  const resolved = params as Params;
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
    'barkTile',
    'cullDistance',
    'scaleMin',
  ] as const;

  for (const key of positive)
    if (!(params[key] > 0)) throw new Error(`--${key} must be positive, got ${params[key]}.`);

  if (params.trunkTaper <= 0 || params.trunkTaper > 1)
    throw new Error('--trunk-taper must be within 0..1.');

  if (params.splits < 1 || params.splits > 12)
    throw new Error('--splits must be within 1..12.');

  // Branch count is splits^levels, so a deep high-split tree is a vertex bomb
  // that only shows up as a multi-second run and a 40MB file.
  if (params.branchLevels < 0 || params.branchLevels > 6)
    throw new Error('--branch-levels must be within 0..6.');

  if (params.splits ** params.branchLevels > 4096)
    throw new Error(
      `--splits ${params.splits} at --branch-levels ${params.branchLevels} is ${params.splits ** params.branchLevels} branches. Lower one of them.`
    );

  if (params.radialSegments < 3 || params.radialSegments > 24)
    throw new Error('--radial-segments must be within 3..24.');

  if (params.segments < 2 || params.segments > 32)
    throw new Error('--segments must be within 2..32.');

  if (params.scaleMax < params.scaleMin)
    throw new Error('--scale-max must not be below --scale-min.');

  // Leaves hang off the deepest generations, so asking for more of them than
  // the tree has produces a trunk covered in foliage.
  if (params.leafLevels < 1 || params.leafLevels > params.branchLevels + 1)
    throw new Error(
      `--leaf-levels must be within 1..${params.branchLevels + 1} at --branch-levels ${params.branchLevels}.`
    );

  if (params.watch && !params.config)
    throw new Error('--watch needs --config, since the config file is what it watches.');

  if (params.knots < 0 || params.knots > 1) throw new Error('--knots must be within 0..1.');
  if (params.knotSize <= 0 || params.knotSize > 1)
    throw new Error('--knot-size must be within 0..1, and above 0.');
  if (params.knotDepth < 0 || params.knotDepth > 1)
    throw new Error('--knot-depth must be within 0..1.');

  // The noise lattice wraps on an integer cell count, so a fractional period
  // would land the wrap mid-cell and put a seam down every trunk. `int` rounds
  // it; this catches the rest.
  if (params.colourPatches < 1 || params.colourPatches > 64)
    throw new Error('--colour-patches must be within 1..64.');

  // Beyond half a cell a fissure has eaten the plate it was meant to separate.
  if (params.grooveWidth <= 0 || params.grooveWidth > 0.5)
    throw new Error('--groove-width must be within 0..0.5, and above 0.');

  if (params.grooveDepth < 0 || params.grooveDepth > 1)
    throw new Error('--groove-depth must be within 0..1 (0 leaves the plates joined).');

  if (params.grooveShade <= 0 || params.grooveShade > 1)
    throw new Error('--groove-shade must be within 0..1, and above 0.');

  if (!['card', 'canopy', 'up'].includes(params.leafNormalMode))
    throw new Error(`--leaf-normal-mode must be card, canopy or up, got '${params.leafNormalMode}'.`);

  // The leaf half is a 4x2 grid, so a cell is a sixteenth of the atlas. Below
  // 128 a cell is under 32 texels and there is no room to draw a leaf in it.
  // Anything that is not a power of two mips into a mess.
  //
  // 128 is a test size, not a shipping one. Nothing renders acceptably below
  // 512, and the default is 1024.
  if (params.textureSize < 128 || (params.textureSize & (params.textureSize - 1)) !== 0)
    throw new Error('--texture-size must be a power of two of at least 128.');
}

/** The options whose value decides what the texture files contain. */
export function textureKeys(): (keyof typeof PARAM_SPEC)[] {
  return (Object.entries(PARAM_SPEC) as [keyof typeof PARAM_SPEC, ParamSpec][])
    .filter(([, spec]) => spec.texture)
    .map(([key]) => key);
}

/** Whether two parameter sets would produce the same texture files. */
export function sameTexture(a: Params, b: Params): boolean {
  return textureKeys().every((key) => a[key] === b[key]);
}

export function helpText(): string {
  const rows = Object.entries(PARAM_SPEC).map(([key, spec]: [string, ParamSpec]) => {
    const flag = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const shown = spec.default === null ? '' : String(spec.default);
    return `  ${flag.padEnd(20)} ${String(shown).padEnd(24)} ${spec.help}`;
  });

  return [
    'tree-forge — procedural trees for the Understory scatter system',
    '',
    'Usage: node tools/tree-forge/cli.js --name <id> [options]',
    '',
    'Options:',
    ...rows,
    '',
  ].join('\n');
}
