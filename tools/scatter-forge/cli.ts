#!/usr/bin/env node
// scatter-forge — procedural scatter assets for the Understory scatter system.
//
// Reads one config and writes a glTF with one material per piece, whose
// COLOR_0 carries the bend, phase and flutter weights the wind vertex stage
// reads, alongside a four-map image per piece, and prints the registry entries
// the model has to be declared through. The file is the whole interface: the
// command line only adds --watch, and --write-template to patch the layer
// into scatter-layers.json.

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import type {
  IGeometryTemplates,
  IMaterialsTemplate,
} from 'rewild-renderer/lib/managers/types';
import type { ScatterLayer } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { writeGlb } from './lib/glb.ts';
import { buildClump, type ClumpMetrics } from './lib/clump.ts';
import { buildCrown, type CrownMetrics } from './lib/crown.ts';
import { boundsOf, buildMesh, totalTriangles, type BarkTile, type ForgeMesh } from './lib/mesh.ts';
import { heightPieces, materialPieces, pieceKeys } from './lib/pieces.ts';
import {
  barkTextureSize,
  hasStem,
  helpText,
  PARAM_SPEC,
  parseConfig,
  resolveParams,
  sameTexture,
  tierParams,
  toConfig,
  type Params,
} from './lib/params.ts';
import { randomSeed } from './lib/rng.ts';
import { buildPebbleCluster, type Cluster } from './lib/pebbles.ts';
import { buildRock, type Rock } from './lib/rock.ts';
import { buildSkeleton, type Skeleton } from './lib/skeleton.ts';
import { buildPebbleCanvases, buildRockCanvases } from './lib/stone.ts';
import type { AtlasLayout } from './lib/atlas.ts';
import {
  atlasLayoutFor,
  fitAccent,
  fitClump,
  fitCrown,
  fitLeaves,
  barkOutputSize,
  barkTileOf,
  loadAccentSource,
  loadBarkSource,
  loadClumpSource,
  loadFrondSource,
  loadLeafSource,
  widestAspect,
  type BarkSource,
  type LeafSource,
  type LeafStamp,
  type StampFit,
} from './lib/sources.ts';
import {
  clumpLayer,
  crownLayer,
  geometryEntry,
  materialEntries,
  pebbleLayer,
  rockLayer,
  scatterLayer,
  scatterLayerEntry,
  writeGeometryTemplate,
  writeScatterLayer,
  writeTemplateFiles,
} from './lib/templates.ts';
import {
  buildClumpCanvases,
  buildCrownCanvases,
  buildTreeCanvases,
  readSetManifest,
  textureFileNames,
  writeSetManifest,
  writeTextureSet,
  type Canvases,
  type SetManifest,
  type TextureNames,
  type TextureSetNames,
} from './lib/textures.ts';
import { renderComparison, renderPreview, type Panel } from './lib/preview.ts';

/** The model grown from its parameters, before anything is written. */
interface Grown {
  mesh: ForgeMesh;
  /** A tree's branch skeleton, or a crown's stem. Null for a type with neither. */
  skeleton: Skeleton | null;
  /** What a clump's layer is measured off, in place of a skeleton. */
  metrics: ClumpMetrics | null;
  /** What a crown's report is measured off. */
  crown: CrownMetrics | null;
  /** The field a rock was grown from, which its bake reads too. */
  rock: Rock | null;
  /** The pebbles a cluster was packed from, and the blocks their bakes read. */
  cluster: Cluster | null;
  layer: ScatterLayer;
}

interface Built extends Grown {
  params: Params;
  /** The scatter-layers.json the layer was patched into, when one was named. */
  writeTemplate: string | null;
  modelPath: string;
  /** One coarser mesh per `lods` entry, nearest first, beside their files. */
  lods: { mesh: ForgeMesh; path: string }[];
  directory: string;
  textures: TextureSetNames;
  geometry: IGeometryTemplates;
  materials: IMaterialsTemplate;
  previewPath: string | null;
  /** The model beside its tiers in one image. Only with `lods` and `preview`. */
  lodPreviewPath: string | null;
  configPath: string;
  /** Exactly what was written back to the config, so the watcher can tell its
   *  own write apart from an edit that landed while it was building. */
  configText: string;
  canvases: Canvases | undefined;
  barkSource: BarkSource | null;
  leafSource: LeafSource | null;
  /** One stamp set per accent, in the config's order. */
  accentSources: LeafSource[];
  /** How the cutout image is cut: the host's cells, then each accent's. */
  layout: AtlasLayout;
  rebuiltTextures: boolean;
}

/** What a type loads: its bark, its own stamps, and one stamp set per accent. */
interface Sources {
  barkSource: BarkSource | null;
  leafSource: LeafSource | null;
  accentSources: LeafSource[];
}

/** A path relative to the shell, unless that climbs out of it. */
function shellPath(target: string): string {
  const nearby = relative(process.cwd(), target);
  return nearby.startsWith('..') ? resolve(target) : nearby;
}

/** Template urls are posix, whatever platform wrote them. */
function assetUrl(root: string, path: string): string {
  return relative(resolve(root), resolve(path)).split(sep).join('/');
}

async function writePreview(
  params: Params,
  mesh: ForgeMesh,
  canvases: Canvases,
  directory: string
): Promise<string> {
  const { default: sharp } = await import('sharp');
  const path = join(directory, `${params.name}.preview.png`);

  await sharp(renderPreview(params, mesh, canvases, params.preview), {
    raw: { width: params.preview, height: params.preview, channels: 3 },
  })
    .png()
    .toFile(path);

  return path;
}

/** Triangles as a label reads them: `LOD1 2828 TRIS 7%`. */
function panelLabel(name: string, mesh: ForgeMesh, base: number | null): string {
  const total = totalTriangles(mesh);
  const share = base && base > 0 ? ` ${Math.max(1, Math.round((total / base) * 100))}%` : '';
  return `${name} ${total} TRIS${share}`;
}

/**
 * The model beside every tier, at one scale, so a handover can be judged.
 *
 * The chain is the whole point of the image, so it is only written when there
 * is one. A single panel would be the model's own preview a second time.
 */
async function writeLodPreview(
  params: Params,
  mesh: ForgeMesh,
  lods: Built['lods'],
  canvases: Canvases,
  directory: string
): Promise<string> {
  const { default: sharp } = await import('sharp');
  const path = join(directory, `${params.name}.lods.preview.png`);
  const base = totalTriangles(mesh);

  const panels: Panel[] = [
    { label: panelLabel('BASE', mesh, null), mesh },
    ...lods.map((lod, index) => ({ label: panelLabel(`LOD${index + 1}`, lod.mesh, base), mesh: lod.mesh })),
  ];

  const { data, width, height } = renderComparison(params, panels, canvases, params.preview);

  await sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(path);

  return path;
}

/**
 * The file, resolved, plus its text for the watcher to compare against.
 *
 * A config with no `seed` gets a fresh one, so an unseeded run cuts a new tree
 * every time. The build writes it into the sidecar, which is what makes a roll
 * you liked keepable.
 *
 * `sessionSeed` holds that roll steady for the life of a watch. Rolling again
 * on every save would reshape the tree under the key being tuned, and the
 * change you were looking at would be lost in the noise. A `seed` added to the
 * file mid-watch still wins, because this only fills an absent one.
 */
async function readParams(
  configPath: string,
  sessionSeed?: number
): Promise<{ params: Params; configText: string; rolled: boolean }> {
  const configText = await readFile(configPath, 'utf8');
  const raw = parseConfig(JSON.parse(configText) as unknown, configPath);
  const rolled = raw.seed === undefined;
  if (rolled) raw.seed = sessionSeed ?? randomSeed();

  return { params: resolveParams(raw), configText, rolled };
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(helpText());
    return;
  }

  const watch = argv.includes('--watch');
  const rest = argv.filter((arg) => arg !== '--watch' && !arg.startsWith(WRITE_TEMPLATE));
  if (rest.length !== 1 || rest[0].startsWith('--'))
    throw new Error(
      `Expected one tree.json and optionally --watch or ${WRITE_TEMPLATE}[=<path>], got '${argv.join(' ')}'. Every other option is a key of the file.`
    );

  const [configPath] = rest;
  const { params, configText, rolled } = await readParams(configPath);
  const built = await generate(params, writeTemplateArg(argv, params.templatesDir));

  report(built, rolled);
  if (watch) await watchConfig(configPath, built, configText, rolled ? params.seed : undefined);
}

const WRITE_TEMPLATE = '--write-template';

/**
 * The scatter-layers.json to patch, or null when the flag is absent. Bare, the
 * flag means the one under the config's templatesDir; `=<path>` names another.
 */
function writeTemplateArg(argv: string[], templatesDir: string): string | null {
  const arg = argv.find((candidate) => candidate === WRITE_TEMPLATE || candidate.startsWith(`${WRITE_TEMPLATE}=`));
  if (arg === undefined) return null;

  const path = arg.slice(WRITE_TEMPLATE.length + 1);
  return resolve(path || join(templatesDir, 'scatter-layers.json'));
}

/**
 * The sources a type names: bark for anything with a tube to wrap, and one
 * set of stamps for its cutout.
 *
 * None listed, the generator runs instead. Listed and missing or broken, these
 * throw rather than falling back, because art that quietly did nothing is
 * worse than a stopped run.
 */
async function loadSources(params: Params): Promise<Sources> {
  // An accent always names its stamps, so none of these is ever null.
  const accentSources = (await Promise.all(params.accents.map((accent) => loadAccentSource(accent.stamps)))) as LeafSource[];

  switch (params.type) {
    case 'clump':
      return { barkSource: null, leafSource: await loadClumpSource(params.blades), accentSources };
    case 'rock':
    case 'pebble':
      return { barkSource: null, leafSource: null, accentSources };
    case 'crown':
      return {
        barkSource: hasStem(params) ? await loadBarkSource(params.bark) : null,
        leafSource: await loadFrondSource(params.fronds),
        accentSources,
      };
    default:
      return { barkSource: await loadBarkSource(params.bark), leafSource: await loadLeafSource(params.leaves), accentSources };
  }
}

/**
 * The layout a reused set was painted with, with this config's accents found
 * in it by their stamps. A variant may list the set's accents in any order or
 * leave some out; one the set never painted has no cells to address, and the
 * set has to be rewritten with it.
 */
function layoutFromManifest(params: Params, painted: SetManifest, directory: string): AtlasLayout {
  const byStamps = (stamps: string[]): string => [...stamps].sort().join(',');
  const accents = params.accents.map((spec) => {
    const match = (painted.accents ?? []).find((entry) => byStamps(entry.stamps) === byStamps(spec.stamps));
    if (!match)
      throw new Error(
        `Texture set '${params.textureSet}' in ${directory} was written without the accent stamps [${spec.stamps.join(', ')}]. ` +
          `Re-run the config that writes the set with this accent listed — at count 0 it paints the cells and hangs nothing.`
      );
    return { offset: match.offset, count: match.cells };
  });

  return { grid: painted.leafGrid, cells: painted.cells ?? painted.leafGrid * painted.leafGrid, accents };
}

/** The model, and the layer it is declared through. */
function grow(params: Params, layout: AtlasLayout, bark: BarkTile | null): Grown {
  if (params.type === 'clump') {
    const { mesh, metrics } = buildClump(params, layout);
    return { mesh, skeleton: null, metrics, crown: null, rock: null, cluster: null, layer: clumpLayer(params, metrics) };
  }

  if (params.type === 'pebble') {
    const cluster = buildPebbleCluster(params);
    return {
      mesh: cluster.mesh,
      skeleton: null,
      metrics: null,
      crown: null,
      rock: null,
      cluster,
      layer: pebbleLayer(params, cluster.metrics),
    };
  }

  if (params.type === 'crown') {
    const crown = buildCrown(params, layout, bark);
    return {
      mesh: crown.mesh,
      skeleton: crown.skeleton,
      metrics: null,
      crown: crown.metrics,
      rock: null,
      cluster: null,
      layer: crownLayer(params, crown),
    };
  }

  if (params.type === 'rock') {
    const rock = buildRock(params);
    return { mesh: rock.mesh, skeleton: null, metrics: null, crown: null, rock, cluster: null, layer: rockLayer(params, rock) };
  }

  const skeleton = buildSkeleton(params);
  return {
    mesh: buildMesh(params, skeleton, layout, bark),
    skeleton,
    metrics: null,
    crown: null,
    rock: null,
    cluster: null,
    layer: scatterLayer(params, skeleton),
  };
}

/**
 * One coarser tier. A tree hangs it on the base skeleton; a crown regrows from
 * the same seed, which lands the same stem and rosette with fewer segments; a
 * rock regrows its field at fewer subdivisions, under the same charts.
 */
function growTier(params: Params, skeleton: Skeleton | null, layout: AtlasLayout, bark: BarkTile | null): ForgeMesh {
  if (params.type === 'crown') return buildCrown(params, layout, bark).mesh;
  if (params.type === 'rock') return buildRock(params).mesh;
  if (params.type === 'pebble') return buildPebbleCluster(params).mesh;
  return buildMesh(params, skeleton!, layout, bark);
}

function paint(
  params: Params,
  { barkSource, leafSource, accentSources }: Sources,
  rock: Rock | null,
  cluster: Cluster | null
): Canvases {
  if (params.type === 'clump') return buildClumpCanvases(params, leafSource, accentSources);
  if (params.type === 'crown') return buildCrownCanvases(params, hasStem(params), barkSource, leafSource, accentSources);
  if (params.type === 'rock') return buildRockCanvases(params, rock!.field);
  if (params.type === 'pebble') return buildPebbleCanvases(params, cluster!);
  return buildTreeCanvases(params, barkSource, leafSource, accentSources);
}

async function generate(params: Params, writeTemplate: string | null, previous?: Built): Promise<Built> {
  const directory = join(params.out, params.textureSet);
  const pieces = pieceKeys(params.type, hasStem(params));
  const withHeight = heightPieces(params.type, hasStem(params));

  const sources = await loadSources(params);
  const { barkSource, leafSource, accentSources } = sources;

  await mkdir(directory, { recursive: true });

  // The cells the cards address have to be the ones the images were painted
  // with. A reused set says so in its manifest; a set being written derives
  // them from the sources.
  const painted = params.skipTextures ? await readSetManifest(directory, params.textureSet) : null;
  const layout = painted
    ? layoutFromManifest(params, painted, directory)
    : atlasLayoutFor(params, leafSource, accentSources);

  const grown = grow(params, layout, barkTileOf(barkSource));
  const { mesh, skeleton } = grown;

  // Built even when the files are being reused, because the preview shades
  // against these pixels rather than against a stand-in palette. Carried over
  // from the last build when nothing that feeds it has changed, which is what
  // makes a mesh edit rebuild in milliseconds rather than seconds.
  const reusable = previous?.canvases && sameTexture(previous.params, params) ? previous.canvases : undefined;
  const canvases =
    reusable ?? (params.skipTextures && !params.preview ? undefined : paint(params, sources, grown.rock, grown.cluster));

  let textures = textureFileNames(params.textureSet, pieces);
  if (!params.skipTextures && !reusable) {
    textures = await writeTextureSet(params, directory, canvases!, withHeight);
    await writeSetManifest(directory, params.textureSet, {
      leafGrid: layout.grid,
      leafSize: params.leafSize,
      cells: layout.cells,
      accents: layout.accents.map((range, index) => ({
        stamps: params.accents[index].stamps,
        offset: range.offset,
        cells: range.count,
      })),
    });
  }

  const modelPath = join(directory, `${params.name}.glb`);
  await writeFile(
    modelPath,
    writeGlb({ name: params.name, mesh, textures, alphaCutoff: params.leafAlphaCutoff })
  );

  // Every tier shares the base's skeleton, so the chain shares a silhouette
  // and the handover moves nothing but detail. A clump has no tiers: it culls
  // rather than coarsening, so there is nothing to hand over to.
  const lods: Built['lods'] = [];
  for (const [index, tier] of params.lods.entries()) {
    const lodMesh = growTier(tierParams(params, tier), skeleton, layout, barkTileOf(barkSource));
    const path = join(directory, `${params.name}.lod${index + 1}.glb`);
    await writeFile(
      path,
      writeGlb({
        name: `${params.name}-lod${index + 1}`,
        mesh: lodMesh,
        textures,
        alphaCutoff: params.leafAlphaCutoff,
      })
    );
    lods.push({ mesh: lodMesh, path });
  }

  // The parameters travel with the model so a variant can be re-cut or nudged
  // without anyone having to remember the command that made it.
  const configPath = join(directory, `${params.name}.forge.json`);
  const configText = `${JSON.stringify(toConfig(params), null, 2)}\n`;
  await writeFile(configPath, configText);

  const previewPath = canvases && params.preview ? await writePreview(params, mesh, canvases, directory) : null;
  const lodPreviewPath =
    canvases && params.preview && lods.length
      ? await writeLodPreview(params, mesh, lods, canvases, directory)
      : null;

  const geometry = geometryEntry(
    params,
    assetUrl(params.assetsRoot, modelPath),
    lods.map((lod) => assetUrl(params.assetsRoot, lod.path))
  );
  const urls = (names: TextureNames): TextureNames => ({
    baseColor: assetUrl(params.assetsRoot, join(directory, names.baseColor)),
    normal: assetUrl(params.assetsRoot, join(directory, names.normal)),
    arm: assetUrl(params.assetsRoot, join(directory, names.arm)),
    height: assetUrl(params.assetsRoot, join(directory, names.height)),
  });

  const materials = materialEntries(
    params,
    Object.fromEntries(pieces.map((piece) => [piece, urls(textures[piece])])),
    materialPieces(params.type, hasStem(params))
  );

  if (params.writeTemplates) await writeTemplateFiles(params.templatesDir, geometry, materials);

  // The layer names the geometry, so the two are declared together. The
  // materials block is optional and stays a paste.
  if (writeTemplate) {
    await writeGeometryTemplate(dirname(writeTemplate), geometry);
    await writeScatterLayer(writeTemplate, grown.layer);
  }

  return {
    ...grown,
    params,
    writeTemplate,
    canvases,
    barkSource,
    leafSource,
    accentSources,
    layout,
    modelPath,
    lods,
    directory,
    textures,
    geometry,
    materials,
    previewPath,
    lodPreviewPath,
    configPath,
    configText,
    rebuiltTextures: !reusable && !params.skipTextures,
  };
}

/** The leaves line of the report: where they came from and how they fit. */
function describeLeaves(params: Params, source: LeafSource | null, layout: AtlasLayout): string[] {
  if (!source) return [`  leaves   generated — no sources listed${onImage(layout)}`];

  const fit = fitLeaves(source, params.leafSize, params.textureSize, params.leafGrid, layout.grid);
  const stamps = `${source.stamps.length} stamp${source.stamps.length === 1 ? '' : 's'}`;
  const lines = [
    `  leaves   from ${source.directories.map(shellPath).join(', ')} (${stamps}, up to ${source.lengthMetres}m long): ` +
      `${fit.stampsPerCell.toFixed(1)} per ${params.leafSize}m card, ${fit.grid}x${fit.grid} grid${onImage(layout)}`,
  ];

  // A stamp that lands on the card larger than it was drawn has nothing to
  // fill the difference with. Said here rather than noticed in-game.
  if (fit.placedPx > fit.sourcePx)
    lines.push(
      `           upscaled ${(fit.placedPx / fit.sourcePx).toFixed(1)}x: a ${fit.sourcePx}px stamp for ` +
        `${Math.round(fit.placedPx)}px of card. Give it a larger source.`
    );

  return [...lines, ...describeDerived(source.stamps)];
}

/**
 * The cost of the accents, where they have pushed the image past the grid the
 * host alone would take: every host cell is smaller for it, and only this
 * says so.
 */
function onImage(layout: AtlasLayout): string {
  const taken = layout.accents.reduce((sum, range) => sum + range.count, 0);
  if (!taken) return '';
  return ` on a ${layout.grid}x${layout.grid} image, ${taken} cell${taken === 1 ? '' : 's'} of it accents`;
}

/** One line per accent: its stamps, its cells, and how the card treats them. */
function describeAccents(params: Params, sources: LeafSource[], layout: AtlasLayout): string[] {
  return sources.flatMap((source, index) => {
    const spec = params.accents[index];
    const range = layout.accents[index];
    const fit = fitAccent(source, params.textureSize, layout.grid);
    const stamps = `${source.stamps.length} stamp${source.stamps.length === 1 ? '' : 's'}`;
    const cells = range.count === 1 ? `cell ${range.offset}` : `cells ${range.offset}..${range.offset + range.count - 1}`;
    const lines = [
      `  accent ${index} from ${source.directories.map(shellPath).join(', ')} (${stamps}, up to ${source.lengthMetres}m long): ` +
        `${cells}, ${fit.cellPx}px a cell, ${spec.count} per site at pitch ${spec.pitch}, ${spec.length}m cards`,
    ];

    if (fit.placedPx > fit.sourcePx)
      lines.push(
        `           upscaled ${(fit.placedPx / fit.sourcePx).toFixed(1)}x: a ${fit.sourcePx}px stamp for ` +
          `${Math.round(fit.placedPx)}px of cell. Give it a larger source, or a larger textureSize.`
      );

    const widest = widestAspect(source);
    if (widest > spec.aspect + 1e-3)
      lines.push(
        `           clipped: the widest stamp is ${widest.toFixed(2)} of its length and the card samples ` +
          `${spec.aspect}. Raise the accent's aspect to ${widest.toFixed(2)} or crop the stamp.`
      );

    return [...lines, ...describeDerived(source.stamps)];
  });
}

/** Which maps came off the diffuse rather than the folder, per stamp set. */
function describeDerived(stamps: LeafStamp[]): string[] {
  const derived = stamps.filter((stamp) => stamp.derived.length);
  if (!derived.length) return [];
  const maps = [...new Set(derived.flatMap((stamp) => stamp.derived))].sort().join(' and ');
  const which = derived.length === stamps.length ? 'every stamp' : derived.map((stamp) => stamp.name).join(', ');
  return [`           ${maps} derived from the diffuse on ${which}`];
}

/**
 * The blades line: where the stamps came from, and what the atlas cost them.
 *
 * Cell size is the number worth watching on a clump. The atlas holds every
 * stamp, so a ninth one takes every cell from half the atlas edge to a third of
 * it, and nothing else says so.
 */
function describeStamps(label: string, source: LeafSource, fit: StampFit, size: string, layout: AtlasLayout): string[] {
  const stamps = `${source.stamps.length} stamp${source.stamps.length === 1 ? '' : 's'}`;
  const lines = [
    `  ${label.padEnd(8)} from ${source.directories.map(shellPath).join(', ')} (${stamps}, up to ${source.lengthMetres}m ${size}): ` +
      `${fit.grid}x${fit.grid} grid${onImage(layout)}, ${fit.cellPx}px a cell`,
  ];

  if (fit.placedPx > fit.sourcePx)
    lines.push(
      `           upscaled ${(fit.placedPx / fit.sourcePx).toFixed(1)}x: a ${fit.sourcePx}px stamp for ` +
        `${Math.round(fit.placedPx)}px of cell. Give it a larger source, or a larger textureSize.`
    );

  return [...lines, ...describeDerived(source.stamps)];
}

function describeBlades(params: Params, source: LeafSource | null, layout: AtlasLayout): string[] {
  if (!source) return [`  blades   generated — no sources listed${onImage(layout)}`];
  return describeStamps('blades', source, fitClump(source, params.textureSize, layout.grid), 'tall', layout);
}

/**
 * The fronds line. A frond card samples `cardAspect` of its cell, so a stamp
 * wider than that loses its edges at the card's, and only this says so.
 */
function describeFronds(params: Params, source: LeafSource | null, layout: AtlasLayout): string[] {
  if (!source) return [`  fronds   generated — no sources listed${onImage(layout)}`];

  const lines = describeStamps('fronds', source, fitCrown(source, params.textureSize, layout.grid), 'long', layout);
  const widest = widestAspect(source);
  if (widest > params.cardAspect + 1e-3)
    lines.push(
      `           clipped: the widest stamp is ${widest.toFixed(2)} of its length and the card samples ` +
        `${params.cardAspect}. Raise cardAspect to ${widest.toFixed(2)} or crop the stamp.`
    );

  return lines;
}

function describeBark(params: Params, source: BarkSource | null): string {
  if (!source) return '  bark     generated — no sources listed';

  const written = barkOutputSize(source, barkTextureSize(params));
  const reduced = written.width !== source.width ? `, written at ${written.width}x${written.height}` : '';
  const derived = source.derived.length ? `, ${source.derived.join(' and ')} derived from the diffuse` : '';
  return (
    `  bark     from ${shellPath(source.directory)} (${source.width}x${source.height} tile${reduced}, ` +
    `${source.widthMetres}m around by ${(source.widthMetres * source.aspect).toFixed(2)}m along${derived})`
  );
}

/** Where the model's sources came from, by type, and the accents after them. */
function describeSources({ params, barkSource, leafSource, accentSources, layout }: Built): string[] {
  const accents = describeAccents(params, accentSources, layout);
  switch (params.type) {
    case 'clump':
      return [...describeBlades(params, leafSource, layout), ...accents];
    case 'rock':
      return ['  stone    generated from the field'];
    case 'pebble':
      return [`  stone    generated from ${params.pebblesPerModel} fields, one per pebble`];
    case 'crown':
      return [
        ...(hasStem(params) ? [describeBark(params, barkSource)] : []),
        ...describeFronds(params, leafSource, layout),
        ...accents,
      ];
    default:
      return [describeBark(params, barkSource), ...describeLeaves(params, leafSource, layout), ...accents];
  }
}

/** Height of the lowest limb, which is where a whorled trunk stops being bare. */
function lowestLimb(skeleton: Skeleton): number {
  const limbs = skeleton.branches.filter((branch) => branch.level === 1);
  return limbs.length ? Math.min(...limbs.map((branch) => branch.points[0].p[1])) : skeleton.trunk.height;
}

/** The second line of the report: what the model measures, by type. */
function describeShape({ params, skeleton, metrics, crown, rock, cluster }: Built): string {
  if (cluster)
    return (
      `  ${cluster.metrics.pebbles} pebbles over a ${(cluster.metrics.clusterRadius * 2).toFixed(2)}m cluster, ` +
      `tallest ${cluster.metrics.height.toFixed(2)}m, ${params.subdivisions} subdivisions a side, ` +
      `${cluster.atlas.columns}x${cluster.atlas.rows} blocks of ${cluster.atlas.chartPx}px charts`
    );

  if (rock)
    return (
      `  height ${rock.metrics.height.toFixed(2)}m, ${rock.metrics.width.toFixed(2)}m by ${rock.metrics.depth.toFixed(2)}m, ` +
      `${rock.field.scoops.length} scoops, ${params.subdivisions} subdivisions a side, ` +
      `hull of ${rock.metrics.hull.length / 3} points`
    );

  if (crown)
    return (
      `  height ${crown.height.toFixed(2)}m, ` +
      (skeleton ? `stem ${crown.stemHeight.toFixed(2)}m, ` : 'no stem, ') +
      `${crown.fronds} fronds of up to ${crown.frondLength.toFixed(2)}m at ${params.cardSegments} segments, ` +
      `spread ${crown.spread.toFixed(2)}m`
    );

  if (skeleton)
    return (
      `  height ${skeleton.trunk.height.toFixed(2)}m, ` +
      // A whorled trunk has no fork to report. What it has instead is the foot
      // left bare below its lowest ring of limbs.
      (params.branchModel === 'whorl'
        ? `${params.whorls} whorls from ${lowestLimb(skeleton).toFixed(2)}m, `
        : `first fork ${skeleton.trunk.splitHeight.toFixed(2)}m, `) +
      `canopy spread ${skeleton.canopy.spread.toFixed(2)}m`
    );

  return (
    `  height ${metrics!.height.toFixed(2)}m, spread ${metrics!.spread.toFixed(2)}m, ` +
    (metrics!.tufts > 1 ? `${metrics!.tufts} tufts over a ${(metrics!.patchRadius * 2).toFixed(1)}m patch, ` : '') +
    `${params.cardsPerTuft} cards at ${params.cardSegments} segments`
  );
}

/** A tier's cost against the base mesh, as a percentage and a factor. */
function share(tier: number, base: number): string {
  if (base === 0) return 'n/a';
  const percent = (tier / base) * 100;
  const cost = percent < 10 ? percent.toFixed(1) : String(Math.round(percent));
  return tier === 0 ? '0% of the base mesh' : `${cost}% of the base mesh, ${(base / tier).toFixed(1)}x lighter`;
}

function report(built: Built, rolledSeed: boolean): void {
  const {
    params,
    mesh,
    modelPath,
    lods,
    directory,
    textures,
    geometry,
    materials,
    layer,
    previewPath,
    lodPreviewPath,
    configPath,
    writeTemplate,
  } = built;
  const bounds = boundsOf(mesh.pieces[0].attributes.positions);
  const baseTriangles = totalTriangles(mesh);
  const breakdown = (target: ForgeMesh): string =>
    target.pieces.map((piece) => `${piece.attributes.triangleCount} ${piece.key}`).join(', ');

  const lines = [
    '',
    `${params.name} — ${params.type}, ${baseTriangles} triangles (${breakdown(mesh)}), ` +
      `seed ${params.seed}${rolledSeed ? ' (rolled, and saved to the params below)' : ''}`,
    describeShape(built),
    `  bounds x ${bounds.min[0].toFixed(2)}..${bounds.max[0].toFixed(2)}, ` +
      `y ${bounds.min[1].toFixed(2)}..${bounds.max[1].toFixed(2)}, ` +
      `z ${bounds.min[2].toFixed(2)}..${bounds.max[2].toFixed(2)}`,
    '',
    `  model    ${modelPath}`,
    ...lods.map(({ mesh: lod, path }, index) => {
      const total = totalTriangles(lod);
      return (
        `  lod ${index + 1}    ${path} — ${total} triangles ` +
        `(${breakdown(lod)}) from ${params.lods[index].distance}m, ` +
        `${share(total, baseTriangles)}`
      );
    }),
    `  params   ${configPath}`,
    ...describeSources(built),
    params.skipTextures
      ? `  textures reused from ${directory}`
      : `  textures ${Object.entries(textures)
          .flatMap(([piece, names]) =>
            // Only the maps that were written. A type that skips `_disp`
            // listing it here would send someone looking for a file that is
            // not there.
            heightPieces(params.type, hasStem(params)).includes(piece)
              ? Object.values(names)
              : [names.baseColor, names.normal, names.arm]
          )
          .map((file) => join(directory, file))
          .join('\n           ')}`,
    ...(previewPath ? [`  preview  ${previewPath}`] : []),
    ...(lodPreviewPath ? [`  lods     ${lodPreviewPath} — the model and every tier at one scale`] : []),
    '',
    'Edit that file and re-run to see the change. It carries every option, preview included.',
    `  node ${shellPath(fileURLToPath(import.meta.url))} ${shellPath(configPath)}`,
    '',
    'templates/geometries.json',
    JSON.stringify(geometry, null, 2)
      .split('\n')
      .slice(1, -1)
      .join('\n'),
    '',
    'templates/scatter-layers.json',
    scatterLayerEntry(layer),
    '',
    ...(materials.materials?.length
      ? [
          // glTF has no displacement slot and the importer builds no heightMap
          // from a file, so this block is the only way to reach the _disp map.
          // Applying it needs `materialId` on the layer, which replaces every
          // one of the model's own materials with one — and that costs the
          // cutout piece its cutout.
          'templates/materials.json — optional, and the only route to the _disp map.',
          'Binding it needs materialId on the layer, which replaces every glTF material with one.',
        ]
      : ['templates/materials.json — textures only. This type writes no _disp map, so it needs no material here.']),
    JSON.stringify(materials, null, 2),
    '',
    ...(writeTemplate
      ? [`${shellPath(writeTemplate)} and the geometries.json beside it patched in place.`]
      : [`Re-run with ${WRITE_TEMPLATE} to patch the layer and its geometry into ${params.templatesDir}/ in place.`]),
    ...(params.writeTemplates ? [`${params.templatesDir}/geometries.json and materials.json patched in place.`] : []),
    '',
  ];

  process.stdout.write(lines.join('\n'));
}

// Long enough not to spin, short enough that a save feels immediate.
const POLL_MS = 200;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rebuilds on every save of the config.
 *
 * Polled rather than watched with fs.watch. A directory watch drops events on
 * macOS and can report a null filename, and a watch on the file itself goes
 * deaf the first time an editor saves atomically, because writing a temporary
 * file and renaming it over the target replaces the inode being watched.
 * Re-reading a few kilobytes five times a second is reliable everywhere and
 * costs nothing.
 *
 * Comparing the contents also solves the feedback loop for free. When the
 * config is the sidecar, a rebuild rewrites it, and a rebuild that rewrote what
 * it just read would otherwise trigger itself forever. When it is a template,
 * nothing writes it and there is no loop to break.
 */
async function watchConfig(
  configPath: string,
  first: Built,
  read: string,
  sessionSeed?: number
): Promise<void> {
  let previous = first;
  let written = settled(configPath, first, read);

  process.stdout.write(`
Watching ${shellPath(configPath)}. Save it to rebuild, ctrl-c to stop.
`);

  for (;;) {
    await delay(POLL_MS);

    let contents: string;
    try {
      contents = await readFile(configPath, 'utf8');
    } catch {
      // Gone for an instant mid-save, or deleted. Neither is worth stopping for.
      continue;
    }

    if (contents === written) continue;
    written = contents;

    const started = Date.now();

    try {
      const next = await readParams(configPath, sessionSeed);
      previous = await generate(next.params, previous.writeTemplate, previous);
      written = settled(configPath, previous, next.configText);

      const what = previous.rebuiltTextures ? 'model and textures' : 'model only, textures reused';
      process.stdout.write(`  ${stamp()}  ${what} in ${Date.now() - started}ms
`);
    } catch (error: unknown) {
      // Kept alive on purpose. A half-written save is invalid JSON for a moment,
      // and an out of range value is an ordinary part of tuning.
      process.stdout.write(`  ${stamp()}  ${error instanceof Error ? error.message : String(error)}
`);
    }
  }
}

/**
 * The config's contents as of the build just done: what the build wrote when
 * the config is its own sidecar, otherwise what was read to start it. Never a
 * fresh read, which would absorb an edit that landed while the build was
 * running and lose it.
 */
function settled(configPath: string, built: Built, read: string): string {
  return resolve(configPath) === resolve(built.configPath) ? built.configText : read;
}

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`scatter-forge: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

export { main, PARAM_SPEC };
