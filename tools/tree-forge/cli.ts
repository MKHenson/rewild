#!/usr/bin/env node
// tree-forge — procedural trees for the Understory scatter system.
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
import { boundsOf, buildMesh, type TreeMesh } from './lib/mesh.ts';
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
import { buildSkeleton, type Skeleton } from './lib/skeleton.ts';
import { fitLeaves, leafGrid, loadBarkSource, loadLeafSource, type BarkSource, type LeafSource } from './lib/sources.ts';
import {
  geometryEntry,
  materialEntries,
  scatterLayer,
  scatterLayerSource,
  writeTemplateFiles,
} from './lib/templates.ts';
import {
  buildCanvases,
  readSetManifest,
  textureFileNames,
  writeSetManifest,
  writeTextureSet,
  type Canvases,
  type TextureNames,
  type TextureSetNames,
} from './lib/textures.ts';
import { renderPreview } from './lib/preview.ts';

interface Built {
  params: Params;
  skeleton: Skeleton;
  mesh: TreeMesh;
  modelPath: string;
  /** One coarser mesh per `lods` entry, nearest first, beside their files. */
  lods: { mesh: TreeMesh; path: string }[];
  directory: string;
  textures: TextureSetNames;
  geometry: IGeometryTemplates;
  materials: IMaterialsTemplate;
  previewPath: string | null;
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
  mesh: TreeMesh,
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

/** The file, resolved, plus its text for the watcher to compare against. */
async function readParams(configPath: string): Promise<{ params: Params; configText: string }> {
  const configText = await readFile(configPath, 'utf8');
  const file = JSON.parse(configText) as unknown;
  return { params: resolveParams(parseConfig(file, configPath)), configText };
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
  const { params, configText } = await readParams(configPath);
  const built = await generate(params);

  report(built);
  if (watch) await watchConfig(configPath, built, configText);
}

async function generate(params: Params, previous?: Built): Promise<Built> {
  const directory = join(params.out, params.textureSet);

  // None listed, the generator runs instead. Listed and missing or broken,
  // these throw rather than falling back, because art that quietly did nothing
  // is worse than a stopped run.
  const barkSource = await loadBarkSource(params.bark);
  const leafSource = await loadLeafSource(params.leaves);

  await mkdir(directory, { recursive: true });

  // The leaf grid the cards address has to be the one the images were painted
  // with. A reused set says so in its manifest; a set being written derives it
  // from the sources and the card size.
  const painted = params.skipTextures ? await readSetManifest(directory, params.textureSet) : null;
  const grid = painted ? painted.leafGrid : leafGrid(leafSource, params.leafSize);

  const skeleton = buildSkeleton(params);
  const mesh = buildMesh(params, skeleton, grid);

  // Built even when the files are being reused, because the preview shades
  // against these pixels rather than against a stand-in palette. Carried over
  // from the last build when nothing that feeds it has changed, which is what
  // makes a mesh edit rebuild in milliseconds rather than seconds.
  const reusable = previous?.canvases && sameTexture(previous.params, params) ? previous.canvases : undefined;
  const canvases =
    reusable ??
    (params.skipTextures && !params.preview ? undefined : buildCanvases(params, barkSource, leafSource));

  let textures = textureFileNames(params.textureSet);
  if (!params.skipTextures && !reusable) {
    textures = await writeTextureSet(params, directory, canvases);
    await writeSetManifest(directory, params.textureSet, { leafGrid: grid, leafSize: params.leafSize });
  }

  const modelPath = join(directory, `${params.name}.glb`);
  await writeFile(
    modelPath,
    writeGlb({
      name: params.name,
      bark: mesh.bark,
      leaves: mesh.leaves,
      textures,
      alphaCutoff: params.leafAlphaCutoff,
    })
  );

  // Every tier is hung on the one skeleton, so the chain shares a silhouette
  // and the handover moves nothing but detail.
  const lods: Built['lods'] = [];
  for (const [index, tier] of params.lods.entries()) {
    const lodMesh = buildMesh(tierParams(params, tier), skeleton, grid);
    const path = join(directory, `${params.name}.lod${index + 1}.glb`);
    await writeFile(
      path,
      writeGlb({
        name: `${params.name}-lod${index + 1}`,
        bark: lodMesh.bark,
        leaves: lodMesh.leaves,
        textures,
        alphaCutoff: params.leafAlphaCutoff,
      })
    );
    lods.push({ mesh: lodMesh, path });
  }

  // The parameters travel with the model so a variant can be re-cut or nudged
  // without anyone having to remember the command that made it.
  const configPath = join(directory, `${params.name}.tree.json`);
  const configText = `${JSON.stringify(toConfig(params), null, 2)}\n`;
  await writeFile(configPath, configText);

  const previewPath = canvases && params.preview ? await writePreview(params, mesh, canvases, directory) : null;

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

  const materials = materialEntries(params, {
    bark: urls(textures.bark),
    leaves: urls(textures.leaves),
  });

  if (params.writeTemplates) await writeTemplateFiles(params.templatesDir, geometry, materials);

  return {
    params,
    skeleton,
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

function report({
  params,
  skeleton,
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
  configPath,
}: Built): void {
  const bounds = boundsOf(mesh.bark.positions);
  const lines = [
    '',
    `${params.name} — ${mesh.bark.triangleCount + mesh.leaves.triangleCount} triangles ` +
      `(${mesh.bark.triangleCount} bark, ${mesh.leaves.triangleCount} leaf), seed ${params.seed}`,
    `  height ${skeleton.trunk.height.toFixed(2)}m, first fork ${skeleton.trunk.splitHeight.toFixed(2)}m, ` +
      `canopy spread ${skeleton.canopy.spread.toFixed(2)}m`,
    `  bounds x ${bounds.min[0].toFixed(2)}..${bounds.max[0].toFixed(2)}, ` +
      `y ${bounds.min[1].toFixed(2)}..${bounds.max[1].toFixed(2)}, ` +
      `z ${bounds.min[2].toFixed(2)}..${bounds.max[2].toFixed(2)}`,
    '',
    `  model    ${modelPath}`,
    ...lods.map(
      ({ mesh: lod, path }, index) =>
        `  lod ${index + 1}    ${path} — ${lod.bark.triangleCount + lod.leaves.triangleCount} triangles ` +
        `(${lod.bark.triangleCount} bark, ${lod.leaves.triangleCount} leaf) from ${params.lods[index].distance}m`
    ),
    `  params   ${configPath}`,
    `  bark     ${
      barkSource
        ? `from ${shellPath(barkSource.directory)} (${barkSource.size}px tile, ${barkSource.widthMetres}m across)`
        : 'generated \u2014 no sources listed'
    }`,
    ...describeLeaves(params, leafSource),
    params.skipTextures
      ? `  textures reused from ${directory}`
      : `  textures ${[...Object.values(textures.bark), ...Object.values(textures.leaves)]
          .map((file) => join(directory, file))
          .join('\n           ')}`,
    ...(previewPath ? [`  preview  ${previewPath}`] : []),
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
    scatterLayerSource(scatterLayer(params, skeleton)),
    '',
    // glTF has no displacement slot and the importer builds no heightMap from a
    // file, so this block is the only way to reach the _disp map. Applying it
    // needs `materialId` on the layer, which replaces both of the model's own
    // materials with one — and that costs the leaves their cutout.
    'templates/materials.json — optional, and the only route to the _disp map.',
    'Binding it needs materialId on the layer, which replaces both glTF materials with one.',
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
async function watchConfig(configPath: string, first: Built, read: string): Promise<void> {
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
      const next = await readParams(configPath);
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
  process.stderr.write(`tree-forge: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

export { main, PARAM_SPEC };
