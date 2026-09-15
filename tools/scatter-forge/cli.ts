#!/usr/bin/env node
// scatter-forge — procedural trees for the Understory scatter system.
//
// Reads one tree.json and writes a two-material glTF whose COLOR_0 carries the
// bend, phase and flutter weights the wind vertex stage reads, alongside two
// four-map images, and prints the registry entries the model has to be
// declared through. The file is the whole interface: the only switch on the
// command line is --watch.

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import type {
  IGeometryTemplates,
  IMaterialsTemplate,
} from 'rewild-renderer/lib/managers/types';
import { writeGlb } from './lib/glb.ts';
import { buildClump, type ClumpMetrics } from './lib/clump.ts';
import { boundsOf, buildMesh, totalTriangles, type ForgeMesh } from './lib/mesh.ts';
import { heightPieces, materialPieces, pieceKeys } from './lib/pieces.ts';
import {
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
import { buildSkeleton, type Skeleton } from './lib/skeleton.ts';
import {
  clumpAtlas,
  fitClump,
  fitLeaves,
  leafGrid,
  loadBarkSource,
  loadClumpSource,
  loadLeafSource,
  type BarkSource,
  type LeafSource,
} from './lib/sources.ts';
import {
  clumpLayer,
  geometryEntry,
  materialEntries,
  scatterLayer,
  scatterLayerSource,
  writeTemplateFiles,
} from './lib/templates.ts';
import {
  buildClumpCanvases,
  buildTreeCanvases,
  readSetManifest,
  textureFileNames,
  writeSetManifest,
  writeTextureSet,
  type Canvases,
  type TextureNames,
  type TextureSetNames,
} from './lib/textures.ts';
import { renderComparison, renderPreview, type Panel } from './lib/preview.ts';

interface Built {
  params: Params;
  /** A tree's branch skeleton. Null for a type that does not branch. */
  skeleton: Skeleton | null;
  /** What a clump's layer is measured off, in place of a skeleton. */
  metrics: ClumpMetrics | null;
  mesh: ForgeMesh;
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
  rebuiltTextures: boolean;
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
  const rest = argv.filter((arg) => arg !== '--watch');
  if (rest.length !== 1 || rest[0].startsWith('--'))
    throw new Error(`Expected one tree.json and optionally --watch, got '${argv.join(' ')}'. Every other option is a key of the file.`);

  const [configPath] = rest;
  const { params, configText, rolled } = await readParams(configPath);
  const built = await generate(params);

  report(built, rolled);
  if (watch) await watchConfig(configPath, built, configText, rolled ? params.seed : undefined);
}

async function generate(params: Params, previous?: Built): Promise<Built> {
  const clump = params.type === 'clump';
  const directory = join(params.out, params.textureSet);
  const pieces = pieceKeys(params.type);
  const withHeight = heightPieces(params.type);

  // None listed, the generator runs instead. Listed and missing or broken,
  // these throw rather than falling back, because art that quietly did nothing
  // is worse than a stopped run.
  const barkSource = clump ? null : await loadBarkSource(params.bark);
  const leafSource = clump ? await loadClumpSource(params.blades) : await loadLeafSource(params.leaves);

  await mkdir(directory, { recursive: true });

  // The cell count the cards address has to be the one the images were painted
  // with. A reused set says so in its manifest; a set being written derives it
  // from the sources — from how many stamps there are for a clump, and from how
  // many leaf lengths fit a card for a tree.
  const painted = params.skipTextures ? await readSetManifest(directory, params.textureSet) : null;
  const atlas = clumpAtlas(leafSource);
  const grid = painted ? painted.leafGrid : clump ? atlas.grid : leafGrid(leafSource, params.leafSize);
  const cells = painted ? (painted.cells ?? grid * grid) : clump ? atlas.cells : grid * grid;

  const skeleton = clump ? null : buildSkeleton(params);
  const built = clump ? buildClump(params, cells) : null;
  const mesh = built ? built.mesh : buildMesh(params, skeleton!, grid);

  // Built even when the files are being reused, because the preview shades
  // against these pixels rather than against a stand-in palette. Carried over
  // from the last build when nothing that feeds it has changed, which is what
  // makes a mesh edit rebuild in milliseconds rather than seconds.
  const reusable = previous?.canvases && sameTexture(previous.params, params) ? previous.canvases : undefined;
  const canvases =
    reusable ??
    (params.skipTextures && !params.preview
      ? undefined
      : clump
      ? buildClumpCanvases(params, leafSource)
      : buildTreeCanvases(params, barkSource, leafSource));

  let textures = textureFileNames(params.textureSet, pieces);
  if (!params.skipTextures && !reusable) {
    textures = await writeTextureSet(params, directory, canvases!, withHeight);
    await writeSetManifest(directory, params.textureSet, {
      leafGrid: grid,
      leafSize: params.leafSize,
      cells,
    });
  }

  const modelPath = join(directory, `${params.name}.glb`);
  await writeFile(
    modelPath,
    writeGlb({ name: params.name, mesh, textures, alphaCutoff: params.leafAlphaCutoff })
  );

  // Every tier is hung on the one skeleton, so the chain shares a silhouette
  // and the handover moves nothing but detail. Only a tree has tiers: a clump
  // culls rather than coarsening, so there is nothing to hand over to.
  const lods: Built['lods'] = [];
  for (const [index, tier] of params.lods.entries()) {
    const lodMesh = buildMesh(tierParams(params, tier), skeleton!, grid);
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
    materialPieces(params.type)
  );

  if (params.writeTemplates) await writeTemplateFiles(params.templatesDir, geometry, materials);

  return {
    params,
    skeleton,
    metrics: built ? built.metrics : null,
    mesh,
    canvases,
    barkSource,
    leafSource,
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
function describeLeaves(params: Params, source: LeafSource | null): string[] {
  if (!source) return ['  leaves   generated — no sources listed'];

  const fit = fitLeaves(source, params.leafSize, params.textureSize);
  const stamps = `${source.stamps.length} stamp${source.stamps.length === 1 ? '' : 's'}`;
  const lines = [
    `  leaves   from ${source.directories.map(shellPath).join(', ')} (${stamps}, up to ${source.lengthMetres}m long): ` +
      `${fit.stampsPerCell.toFixed(1)} per ${params.leafSize}m card, ${fit.grid}x${fit.grid} grid`,
  ];

  // A stamp that lands on the card larger than it was drawn has nothing to
  // fill the difference with. Said here rather than noticed in-game.
  if (fit.placedPx > fit.sourcePx)
    lines.push(
      `           upscaled ${(fit.placedPx / fit.sourcePx).toFixed(1)}x: a ${fit.sourcePx}px stamp for ` +
        `${Math.round(fit.placedPx)}px of card. Give it a larger source.`
    );

  return lines;
}

/**
 * The blades line: where the stamps came from, and what the atlas cost them.
 *
 * Cell size is the number worth watching on a clump. The atlas holds every
 * stamp, so a ninth one takes every cell from half the atlas edge to a third of
 * it, and nothing else says so.
 */
function describeBlades(params: Params, source: LeafSource | null): string[] {
  if (!source) return ['  blades   generated — no sources listed'];

  const fit = fitClump(source, params.textureSize);
  const stamps = `${source.stamps.length} stamp${source.stamps.length === 1 ? '' : 's'}`;
  const lines = [
    `  blades   from ${source.directories.map(shellPath).join(', ')} (${stamps}, up to ${source.lengthMetres}m tall): ` +
      `${fit.grid}x${fit.grid} grid, ${fit.cellPx}px a cell`,
  ];

  if (fit.placedPx > fit.sourcePx)
    lines.push(
      `           upscaled ${(fit.placedPx / fit.sourcePx).toFixed(1)}x: a ${fit.sourcePx}px stamp for ` +
        `${Math.round(fit.placedPx)}px of cell. Give it a larger source, or a larger textureSize.`
    );

  return lines;
}

/** A tier's cost against the base mesh, as a percentage and a factor. */
function share(tier: number, base: number): string {
  if (base === 0) return 'n/a';
  const percent = (tier / base) * 100;
  const cost = percent < 10 ? percent.toFixed(1) : String(Math.round(percent));
  return tier === 0 ? '0% of the base mesh' : `${cost}% of the base mesh, ${(base / tier).toFixed(1)}x lighter`;
}

function report(
  {
    params,
    skeleton,
    metrics,
    mesh,
    barkSource,
    leafSource,
    modelPath,
    lods,
    directory,
    textures,
    geometry,
    materials,
    previewPath,
    lodPreviewPath,
    configPath,
  }: Built,
  rolledSeed: boolean
): void {
  const bounds = boundsOf(mesh.pieces[0].attributes.positions);
  const baseTriangles = totalTriangles(mesh);
  const breakdown = (target: ForgeMesh): string =>
    target.pieces.map((piece) => `${piece.attributes.triangleCount} ${piece.key}`).join(', ');

  const lines = [
    '',
    `${params.name} — ${params.type}, ${baseTriangles} triangles (${breakdown(mesh)}), ` +
      `seed ${params.seed}${rolledSeed ? ' (rolled, and saved to the params below)' : ''}`,
    skeleton
      ? `  height ${skeleton.trunk.height.toFixed(2)}m, first fork ${skeleton.trunk.splitHeight.toFixed(2)}m, ` +
        `canopy spread ${skeleton.canopy.spread.toFixed(2)}m`
      : `  height ${metrics!.height.toFixed(2)}m, spread ${metrics!.spread.toFixed(2)}m, ` +
        (metrics!.tufts > 1
          ? `${metrics!.tufts} tufts over a ${(metrics!.patchRadius * 2).toFixed(1)}m patch, `
          : '') +
        `${params.cardsPerTuft} cards at ${params.cardSegments} segments`,
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
    ...(params.type === 'tree'
      ? [
          `  bark     ${
            barkSource
              ? `from ${shellPath(barkSource.directory)} (${barkSource.size}px tile, ${barkSource.widthMetres}m across)`
              : 'generated \u2014 no sources listed'
          }`,
          ...describeLeaves(params, leafSource),
        ]
      : describeBlades(params, leafSource)),
    params.skipTextures
      ? `  textures reused from ${directory}`
      : `  textures ${Object.entries(textures)
          .flatMap(([piece, names]) =>
            // Only the maps that were written. A type that skips `_disp`
            // listing it here would send someone looking for a file that is
            // not there.
            heightPieces(params.type).includes(piece)
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
    'ScatterLayers.ts — add to SCATTER_LAYERS',
    scatterLayerSource(skeleton ? scatterLayer(params, skeleton) : clumpLayer(params, metrics!)),
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
    params.writeTemplates ? 'templates/ patched in place.' : 'Re-run with --write-templates to patch templates/ in place.',
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
      previous = await generate(next.params, previous);
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
