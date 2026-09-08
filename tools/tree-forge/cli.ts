#!/usr/bin/env node
// tree-forge — procedural trees for the Understory scatter system.
//
// Writes a two-material glTF whose COLOR_0 carries the bend, phase and flutter
// weights the wind vertex stage reads, alongside a four-map texture template,
// and prints the registry entries the model has to be declared through.

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
  argsFromConfig,
  helpText,
  parseArgs,
  PARAM_SPEC,
  resolveParams,
  sameTexture,
  toConfig,
  type Params, 
  type RawArgs,
} from './lib/params.ts';
import { buildSkeleton, type Skeleton } from './lib/skeleton.ts';
import {
  geometryEntry,
  materialEntries,
  scatterLayer, 
  scatterLayerSource,
  writeTemplateFiles,
} from './lib/templates.ts';
import {
  buildCanvas,
  textureFileNames,
  writeTextureSet,
  type Canvas,
  type TextureNames,
} from './lib/textures.ts';
import { renderPreview } from './lib/preview.ts';

interface Built {
  params: Params;
  skeleton: Skeleton;
  mesh: TreeMesh;
  modelPath: string;
  directory: string;
  textures: TextureNames;
  geometry: IGeometryTemplates;
  materials: IMaterialsTemplate;
  previewPath: string | null;
  configPath: string;
  /** Exactly what was written back to the config, so the watcher can tell its
   *  own write apart from an edit that landed while it was building. */
  configText: string;
  canvas: Canvas | undefined;
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
  canvas: Canvas,
  directory: string
): Promise<string> {
  const { default: sharp } = await import('sharp');
  const path = join(directory, `${params.name}.preview.png`);

  await sharp(renderPreview(params, mesh, canvas, params.preview), {
    raw: { width: params.preview, height: params.preview, channels: 3 },
  })
    .png()
    .toFile(path);

  return path;
}

/** The config as overrides, with the command line still winning over it. */
async function readParams(raw: RawArgs): Promise<Params> {
  if (typeof raw.config !== 'string') return resolveParams(raw);

  const file = JSON.parse(await readFile(raw.config, 'utf8')) as unknown;
  return resolveParams({ ...argsFromConfig(file, raw.config), ...raw });
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(helpText());
    return;
  }

  const raw = parseArgs(argv);
  const params = await readParams(raw);
  const built = await generate(params);

  report(built);
  if (params.watch) await watchConfig(built.configPath, raw, built);
}

async function generate(params: Params, previous?: Built): Promise<Built> {
  const directory = join(params.out, params.textureSet);

  const skeleton = buildSkeleton(params);
  const mesh = buildMesh(params, skeleton);

  await mkdir(directory, { recursive: true });

  // Built even when the files are being reused, because the preview shades
  // against these pixels rather than against a stand-in palette. Carried over
  // from the last build when nothing that feeds it has changed, which is what
  // makes a mesh edit rebuild in milliseconds rather than seconds.
  const reusable = previous?.canvas && sameTexture(previous.params, params) ? previous.canvas : undefined;
  const canvas = reusable ?? (params.skipTextures && !params.preview ? undefined : buildCanvas(params));

  const textures =
    params.skipTextures || reusable
      ? textureFileNames(params.textureSet)
      : await writeTextureSet(params, directory, canvas);

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

  // The parameters travel with the model so a variant can be re-cut or nudged
  // without anyone having to remember the command that made it.
  const configPath = join(directory, `${params.name}.tree.json`);
  const configText = `${JSON.stringify(toConfig(params), null, 2)}\n`;
  await writeFile(configPath, configText);

  const previewPath = canvas && params.preview ? await writePreview(params, mesh, canvas, directory) : null;

  const geometry = geometryEntry(params, assetUrl(params.assetsRoot, modelPath));
  const materials = materialEntries(params, {
    baseColor: assetUrl(params.assetsRoot, join(directory, textures.baseColor)),
    normal: assetUrl(params.assetsRoot, join(directory, textures.normal)),
    arm: assetUrl(params.assetsRoot, join(directory, textures.arm)),
    height: assetUrl(params.assetsRoot, join(directory, textures.height)),
  });

  if (params.writeTemplates) await writeTemplateFiles(params.templatesDir, geometry, materials);

  return {
    params,
    skeleton,
    mesh,
    canvas,
    modelPath,
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

function report({
  params,
  skeleton,
  mesh,
  modelPath,
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
    `  params   ${configPath}`,
    params.skipTextures
      ? `  textures reused from ${directory}`
      : `  textures ${Object.values(textures).map((file) => join(directory, file)).join('\n           ')}`,
    ...(previewPath ? [`  preview  ${previewPath}`] : []),
    '',
    'Edit that file and re-run to see the change. It carries every option, --preview included.',
    `  node ${shellPath(fileURLToPath(import.meta.url))} --config ${shellPath(configPath)}`,
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
 * Comparing the contents also solves the feedback loop for free: a rebuild
 * writes this same file, and a rebuild that rewrote what it just read would
 * otherwise trigger itself forever.
 */
async function watchConfig(configPath: string, raw: RawArgs, first: Built): Promise<void> {
  let previous = first;
  let written = first.configText;

  process.stdout.write(`\nWatching ${shellPath(configPath)}. Save it to rebuild, ctrl-c to stop.\n`);

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
      previous = await generate(await readParams(raw), previous);

      // What the rebuild wrote, not a fresh read. Re-reading here would absorb
      // any edit that landed while the rebuild was running and lose it.
      written = previous.configText;

      const what = previous.rebuiltTextures ? 'model and textures' : 'model only, textures reused';
      process.stdout.write(`  ${stamp()}  ${what} in ${Date.now() - started}ms\n`);
    } catch (error: unknown) {
      // Kept alive on purpose. A half-written save is invalid JSON for a moment,
      // and an out of range value is an ordinary part of tuning.
      process.stdout.write(`  ${stamp()}  ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`tree-forge: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

export { main, PARAM_SPEC };
