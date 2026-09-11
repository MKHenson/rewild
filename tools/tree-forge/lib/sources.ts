// Hand-authored texture sources, loaded off disk.
//
// A source is a folder of maps plus the one thing a bitmap cannot say about
// itself: how big it is in the world. Everything the assembler does with it —
// how many times a bark tile repeats, how many leaves go on a card, how strong
// a normal comes out — is computed from that rather than guessed.
//
// A tree names its sources by folder. Naming none is not an error: the
// generator is what runs instead. Naming one that is missing or wrong is,
// because art that quietly fell back to generation would look like the art
// having no effect.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { gutterFor } from './atlas.ts';
import { srgbToLinear } from './colour.ts';

/**
 * `tools/tree-forge/sources`, resolved off this file rather than the cwd.
 *
 * Called rather than computed at import, because `import.meta.url` is not
 * defined under the test runner's transform and a module that cannot be
 * imported there takes every test in the file with it.
 */
export function sourceRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'sources');
}

/** One source's maps, as float channels at the source's own resolution. */
export interface BarkSource {
  name: string;
  directory: string;
  /** Metres of trunk one tile of this bark covers. */
  widthMetres: number;
  /** How far its height spans, in metres. */
  depthMetres: number;
  size: number;
  /** Three floats a texel, in display space — the same space the generator
   *  writes and the encoder reads. */
  albedo: Float32Array;
  ao: Float32Array;
  roughness: Float32Array;
  metallic: Float32Array;
  /** 0..1, off the 16-bit map. */
  height: Float32Array;
}

/**
 * One leaf, stem at the bottom-middle of the image and tip at the top-middle.
 * That is the contract that lets the forge rotate it about its stem without
 * being told where the stem is.
 */
export interface LeafStamp {
  /** The folder and the file prefix the three maps share. */
  name: string;
  /** Stem to tip, in metres, as the stamp's own folder declares it. Stamps
   *  from several folders keep their own sizes when they share a card. */
  lengthMetres: number;
  /** Pixel size. */
  columns: number;
  rows: number;
  /** Three floats a texel, in linear light: stamps are blended over each other
   *  and over the card, and blending happens in linear. */
  albedo: Float32Array;
  alpha: Float32Array;
  ao: Float32Array;
  roughness: Float32Array;
  metallic: Float32Array;
  /** 0..1, off the 16-bit map. */
  height: Float32Array;
  /** Rows and columns the cutout spans, off the alpha. The pivot sits on the
   *  bottom row and the tip on the top one. */
  extent: { left: number; right: number; top: number; bottom: number };
}

/** Every stamp the named folders hold, as one set to draw from. */
export interface LeafSource {
  names: string[];
  directories: string[];
  /** The longest stamp, stem to tip, in metres. What the layout is sized by. */
  lengthMetres: number;
  /** The deepest relief any folder declares, or null where none does — then
   *  the settled bump strength applies. */
  depthMetres: number | null;
  stamps: LeafStamp[];
}

/** Stem to tip in texels, which is what the declared length maps onto. */
export function stampLengthPx(stamp: LeafStamp): number {
  return stamp.extent.bottom - stamp.extent.top + 1;
}

const ROLES = ['diff', 'arm', 'disp'] as const;
type Role = (typeof ROLES)[number];
type MapSet = Record<Role, string>;

/**
 * The map sets in a folder, keyed on the prefix before `-diff`, `-arm` and
 * `-disp`. Matched on the suffix rather than on the folder's name, so renaming
 * a source does not mean renaming every file in it, and so one folder can hold
 * several sets.
 */
async function mapSets(directory: string): Promise<Map<string, MapSet>> {
  let listing: string[];
  try {
    listing = await readdir(directory);
  } catch {
    throw new Error(`Source '${directory}' cannot be read.`);
  }

  const partial = new Map<string, Partial<MapSet>>();
  for (const file of listing) {
    const match = /^(.+)-(diff|arm|disp)\.[a-z0-9]+$/i.exec(file);
    if (!match) continue;
    const set = partial.get(match[1]) ?? {};
    set[match[2].toLowerCase() as Role] = join(directory, file);
    partial.set(match[1], set);
  }

  if (!partial.size)
    throw new Error(`Source '${directory}' has no *-diff map. It needs all of: ${ROLES.join(', ')}.`);

  const sets = new Map<string, MapSet>();
  for (const [prefix, set] of partial) {
    for (const role of ROLES)
      if (!set[role])
        throw new Error(`Source '${directory}' has no ${prefix}-${role} map. Every set needs all of: ${ROLES.join(', ')}.`);
    sets.set(prefix, set as MapSet);
  }

  return sets;
}

async function readMetadata(
  directory: string,
  required: string[],
  optional: string[] = []
): Promise<Record<string, number>> {
  const path = join(directory, 'source.json');
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`Source '${directory}' has no readable source.json. It must declare ${required.join(' and ')}.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${path} must hold a JSON object.`);

  const out: Record<string, number> = {};
  for (const field of [...required, ...optional]) {
    const value = (parsed as Record<string, unknown>)[field];
    if (value === undefined && optional.includes(field)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new Error(`${path} must declare '${field}' as a positive number.`);
    out[field] = value;
  }

  return out;
}

/**
 * The 16-bit samples of a height map.
 *
 * `toColourspace('grey16')` is load-bearing. Every other route through sharp —
 * `raw({depth:'ushort'})` on its own, `removeAlpha`, `extractChannel`,
 * `pipelineColourspace` — quietly returns the 8-bit downconversion, which would
 * throw away the precision the whole 16-bit requirement exists to keep.
 */
async function readHeight(path: string, width: number, height: number): Promise<Float32Array> {
  const meta = await sharp(path).metadata();
  if (meta.depth !== 'ushort')
    throw new Error(`${path} is ${meta.depth}, not 16-bit. A height map differentiated from 8 bits terraces.`);
  if (meta.width !== width || meta.height !== height)
    throw new Error(`${path} is ${meta.width}x${meta.height}, but the source's other maps are ${width}x${height}.`);

  const { data, info } = await sharp(path).toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = data.readUInt16LE(i * info.channels * 2) / 65535;
  return out;
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function readRaw(path: string): Promise<Raw> {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function sameSize(a: Raw, b: Raw, directory: string): void {
  if (a.width !== b.width || a.height !== b.height)
    throw new Error(`Source '${directory}' has a ${b.width}x${b.height} arm map against a ${a.width}x${a.height} diffuse.`);
}

async function requireDirectory(directory: string, kind: string, name: string): Promise<void> {
  try {
    await readdir(directory);
  } catch {
    throw new Error(`No ${kind} source '${name}': ${directory} does not exist.`);
  }
}

/**
 * The bark source a tree names, or null where it names none.
 *
 * Null is the signal to generate instead. Anything else throws. One name for
 * now: combining two barks is a height-based blend, not a lerp, and that is
 * its own piece of work.
 */
export async function loadBarkSource(
  names: string[],
  root: string = sourceRoot()
): Promise<BarkSource | null> {
  if (names.length === 0) return null;
  if (names.length > 1)
    throw new Error(`bark lists ${names.length} sources. Assembling more than one bark is not supported yet.`);

  const [name] = names;
  const directory = join(root, 'bark', name);
  await requireDirectory(directory, 'bark', name);

  const sets = await mapSets(directory);
  if (sets.size > 1)
    throw new Error(`Source '${directory}' holds ${sets.size} map sets. A bark source is one tile.`);
  const paths = [...sets.values()][0];
  const { widthMetres, depthMetres } = await readMetadata(directory, ['widthMetres', 'depthMetres']);

  const diff = await readRaw(paths.diff);
  const arm = await readRaw(paths.arm);
  if (diff.width !== diff.height)
    throw new Error(`${paths.diff} is ${diff.width}x${diff.height}. A bark tile must be square.`);
  sameSize(diff, arm, directory);

  const size = diff.width;
  const texels = size * size;
  const albedo = new Float32Array(texels * 3);
  const ao = new Float32Array(texels);
  const roughness = new Float32Array(texels);
  const metallic = new Float32Array(texels);

  for (let i = 0; i < texels; i++) {
    for (let c = 0; c < 3; c++) albedo[i * 3 + c] = diff.data[i * diff.channels + c] / 255;
    ao[i] = arm.data[i * arm.channels] / 255;
    roughness[i] = arm.data[i * arm.channels + 1] / 255;
    metallic[i] = arm.data[i * arm.channels + 2] / 255;
  }

  return {
    name,
    directory,
    widthMetres,
    depthMetres,
    size,
    albedo,
    ao,
    roughness,
    metallic,
    height: await readHeight(paths.disp, size, size),
  };
}

async function loadStamp(name: string, lengthMetres: number, paths: MapSet, directory: string): Promise<LeafStamp> {
  const diff = await readRaw(paths.diff);
  if (diff.channels !== 4)
    throw new Error(`${paths.diff} has no alpha channel. A leaf stamp's cutout is its alpha.`);
  const arm = await readRaw(paths.arm);
  sameSize(diff, arm, directory);

  const { width: columns, height: rows } = diff;
  const texels = columns * rows;
  const albedo = new Float32Array(texels * 3);
  const alpha = new Float32Array(texels);
  const ao = new Float32Array(texels);
  const roughness = new Float32Array(texels);
  const metallic = new Float32Array(texels);
  const extent = { left: columns, right: -1, top: rows, bottom: -1 };

  for (let i = 0; i < texels; i++) {
    for (let c = 0; c < 3; c++) albedo[i * 3 + c] = srgbToLinear(diff.data[i * 4 + c] / 255);
    alpha[i] = diff.data[i * 4 + 3] / 255;
    ao[i] = arm.data[i * arm.channels] / 255;
    roughness[i] = arm.data[i * arm.channels + 1] / 255;
    metallic[i] = arm.data[i * arm.channels + 2] / 255;

    if (alpha[i] > 0) {
      const x = i % columns;
      const y = (i - x) / columns;
      if (x < extent.left) extent.left = x;
      if (x > extent.right) extent.right = x;
      if (y < extent.top) extent.top = y;
      if (y > extent.bottom) extent.bottom = y;
    }
  }

  if (extent.right < 0) throw new Error(`${paths.diff} is transparent everywhere. There is no leaf in it.`);

  return {
    name,
    lengthMetres,
    columns,
    rows,
    albedo,
    alpha,
    ao,
    roughness,
    metallic,
    height: await readHeight(paths.disp, columns, rows),
    extent,
  };
}

/**
 * Every stamp in the folders a tree names, or null where it names none.
 *
 * Every map set in every folder is one stamp, so two species' folders listed
 * together fill a card with both. Null is the signal to generate instead.
 * Anything else throws.
 */
export async function loadLeafSource(
  names: string[],
  root: string = sourceRoot()
): Promise<LeafSource | null> {
  if (names.length === 0) return null;

  const directories: string[] = [];
  const stamps: LeafStamp[] = [];
  let lengthMetres = 0;
  let depthMetres: number | null = null;

  for (const name of names) {
    const directory = join(root, 'leaves', name);
    await requireDirectory(directory, 'leaf', name);
    directories.push(directory);

    const sets = await mapSets(directory);
    const metadata = await readMetadata(directory, ['lengthMetres'], ['depthMetres']);
    lengthMetres = Math.max(lengthMetres, metadata.lengthMetres);
    if (metadata.depthMetres !== undefined) depthMetres = Math.max(depthMetres ?? 0, metadata.depthMetres);

    // Sorted so a stamp's index, and with it every cell that picks it, is the
    // same on every machine whatever order the directory lists in.
    for (const [prefix, paths] of [...sets].sort(([a], [b]) => a.localeCompare(b)))
      stamps.push(await loadStamp(`${name}/${prefix}`, metadata.lengthMetres, paths, directory));
  }

  return { names, directories, lengthMetres, depthMetres, stamps };
}

/**
 * How many times a tile repeats across the bark image.
 *
 * The ring maps once across the width, so the width is one circumference, and
 * the tile has to divide into it a whole number of times or the seam that the
 * ring closes on stops matching. The same count runs down the length, because
 * length advances by one circumference per image too — which is what lands the
 * tile square rather than stretched.
 */
export function tileRepeats(source: BarkSource, trunkRadius: number): number {
  return Math.max(1, Math.round((2 * Math.PI * trunkRadius) / source.widthMetres));
}

/**
 * The gradient gain that turns a height spanning `depthMetres` into a normal.
 *
 * `encodeNormal` runs a Sobel, whose response to a ramp is eight times the step
 * per texel, and compares it against 1. So the gain is the height's real depth
 * over the real width of a texel, divided by that eight.
 */
export function gradientGain(depthMetres: number, metresPerTexel: number): number {
  return depthMetres / (8 * metresPerTexel);
}

export function normalStrength(source: BarkSource, repeats: number, size: number): number {
  return gradientGain(source.depthMetres, (repeats * source.widthMetres) / size);
}

/** The leaf grid the generator draws, and the most a source is spread over. */
export const LEAF_GRID_GENERATED = 4;

/**
 * Leaves along a card's height: `leafSize` over the declared length.
 *
 * This one division is what separates an oak from a palm without a mode flag.
 * Many leaves per card composes a cluster; one leaf per card is the frond
 * itself. Floored at one, so a leaf longer than its card fills the card.
 */
export function stampsPerCell(source: LeafSource, leafSize: number): number {
  return Math.max(1, leafSize / source.lengthMetres);
}

/**
 * Cells along each edge of the leaf image.
 *
 * Derived rather than fixed, because a cell's variety comes from how its
 * leaves are arranged, and a cell holding one leaf has no arrangement to vary.
 * Sixteen copies of a frond are worth nothing and the frond needs every texel
 * it can get, so a species whose leaf fills its card gets fewer, larger cells.
 * A set with several stamps still gets a second row so each can be seen.
 */
export function leafGrid(source: LeafSource | null, leafSize: number): number {
  if (!source) return LEAF_GRID_GENERATED;
  const perCell = stampsPerCell(source, leafSize);
  if (perCell >= 4) return LEAF_GRID_GENERATED;
  if (perCell >= 2 || source.stamps.length > 1) return 2;
  return 1;
}

/** How a leaf source lands on the card, and whether it has the texels for it. */
export interface LeafFit {
  grid: number;
  stampsPerCell: number;
  /** Texels the most stretched stamp gets on the canvas, stem to tip. */
  placedPx: number;
  /** Texels that stamp has. */
  sourcePx: number;
  /** The gain the composited height needs to become a normal, or null to take
   *  the settled value. */
  bumpStrength: number | null;
}

export function fitLeaves(source: LeafSource, leafSize: number, textureSize: number): LeafFit {
  const grid = leafGrid(source, leafSize);
  const perCell = stampsPerCell(source, leafSize);
  const inner = textureSize / grid - 2 * gutterFor(textureSize);

  // Each stamp lands at its own declared length; the one stretched furthest
  // past its texels is the one worth reporting.
  let placedPx = 0;
  let sourcePx = 1;
  for (const stamp of source.stamps) {
    const placed = (inner / perCell) * (stamp.lengthMetres / source.lengthMetres);
    if (placed / stampLengthPx(stamp) > placedPx / sourcePx) {
      placedPx = placed;
      sourcePx = stampLengthPx(stamp);
    }
  }

  return {
    grid,
    stampsPerCell: perCell,
    placedPx,
    sourcePx,
    bumpStrength: source.depthMetres === null ? null : gradientGain(source.depthMetres, leafSize / inner),
  };
}
