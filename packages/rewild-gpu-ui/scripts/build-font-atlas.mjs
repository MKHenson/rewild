/**
 * Builds the Roboto MTSDF atlas that the GPU UI draws text with. It holds the
 * regular and bold faces in one texture.
 *
 *     npm run ui-font
 *
 * Writes `fonts/roboto-msdf.png` and `fonts/roboto-msdf.json`. Commit both,
 * so only someone who changes the atlas needs the tools below.
 *
 * It needs msdf-atlas-gen 1.4 or later (https://github.com/Chlumsky/msdf-atlas-gen)
 * on the PATH, or at the path in the MSDF_ATLAS_GEN environment variable:
 *
 * - macOS: `brew install msdf-atlas-gen`.
 * - Windows: download the Windows release from the GitHub releases page and
 *   put `msdf-atlas-gen.exe` on the PATH, or set MSDF_ATLAS_GEN to it.
 * - Linux: there is no package. Build it from source. See `howToInstall()`.
 *
 * msdf-atlas-gen reads kerning only from the old `kern` table, and Roboto
 * keeps its kerning in `GPOS`. So this script reads the kerning with
 * opentype.js and writes it into the JSON.
 *
 * The JSON is msdf-atlas-gen's, with `yOrigin: 'top'`: y runs down, so the
 * ascender is negative and the descender positive. Plane bounds are in ems
 * from the pen on the baseline. Atlas bounds are in texels from the top left.
 */
import opentype from 'opentype.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(here, '..', 'fonts');
const pngFile = path.join(fontsDir, 'roboto-msdf.png');
const jsonFile = path.join(fontsDir, 'roboto-msdf.json');

const FACES = [
  { name: 'regular', file: 'Roboto-Regular.ttf' },
  { name: 'bold', file: 'Roboto-Bold.ttf' },
];

/** Atlas texels per em. */
const EM_SIZE = 40;
/** The width of the distance field in texels, across the edge. */
const DISTANCE_RANGE = 8;
/** The version this script was written against. */
const TESTED_VERSION = [1, 4];

/** Latin-1, the rest of Windows-1252, and common symbols, in msdf-atlas-gen's charset syntax. */
const CHARSET = [
  '[0x20, 0x7e]',
  '[0xa0, 0xff]',
  '0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc',
  '0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020',
  '0x2021, 0x2022, 0x2026, 0x2030, 0x2032, 0x2033, 0x2039, 0x203a, 0x20ac',
  '0x2122, 0x2212',
].join(', ');

/** Each code point in CHARSET, to report the ones a face does not have. */
function charsetCodes() {
  const codes = [];
  for (const [, from, to] of CHARSET.matchAll(/\[(\w+),\s*(\w+)\]/g))
    for (let c = Number(from); c <= Number(to); c++) codes.push(c);
  for (const [single] of CHARSET.replace(/\[[^\]]*\]/g, '').matchAll(/0x\w+/g))
    codes.push(Number(single));
  return codes;
}

function fail(message) {
  console.error(`\nbuild-font-atlas: ${message}\n`);
  process.exit(1);
}

function howToInstall() {
  const releases = 'https://github.com/Chlumsky/msdf-atlas-gen/releases';
  switch (process.platform) {
    case 'darwin':
      return 'Install it with Homebrew:\n\n    brew install msdf-atlas-gen';
    case 'win32':
      return [
        `Download the Windows release from ${releases}`,
        'and unzip it. Then put the folder with msdf-atlas-gen.exe on the PATH,',
        'or point MSDF_ATLAS_GEN at the file:',
        '',
        '    set MSDF_ATLAS_GEN=C:\\tools\\msdf-atlas-gen\\msdf-atlas-gen.exe',
      ].join('\n');
    default:
      return [
        'There is no Linux package. Build it from source, with the FreeType,',
        'libpng and tinyxml2 development packages installed:',
        '',
        '    git clone --recursive https://github.com/Chlumsky/msdf-atlas-gen.git',
        '    cd msdf-atlas-gen',
        '    cmake -B build -DCMAKE_BUILD_TYPE=Release \\',
        '      -DMSDF_ATLAS_USE_VCPKG=OFF -DMSDF_ATLAS_USE_SKIA=OFF',
        '    cmake --build build',
        '',
        'Then put build/bin on the PATH, or point MSDF_ATLAS_GEN at the binary.',
        'With vcpkg, leave out the two OFF options and set VCPKG_ROOT. CMake then',
        'fetches the dependencies. See the msdf-atlas-gen README.',
      ].join('\n');
  }
}

/** Finds msdf-atlas-gen and checks its version. Returns the command to run. */
function findTool() {
  const fromEnv = process.env.MSDF_ATLAS_GEN;
  if (fromEnv && !fs.existsSync(fromEnv))
    fail(
      `MSDF_ATLAS_GEN is set to "${fromEnv}", but there is no file there.\n\n` +
        howToInstall()
    );
  const command = fromEnv || 'msdf-atlas-gen';
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT')
    fail(`msdf-atlas-gen is not on the PATH.\n\n${howToInstall()}`);
  if (result.error)
    fail(`msdf-atlas-gen did not start: ${result.error.message}`);

  const output = `${result.stdout}${result.stderr}`;
  const match = output.match(/MSDF-Atlas-Gen v(\d+)\.(\d+)/i);
  if (!match)
    fail(`"${command} -version" printed no version:\n\n${output.trim()}`);
  const [major, minor] = [Number(match[1]), Number(match[2])];
  if (major < TESTED_VERSION[0] || (major === TESTED_VERSION[0] && minor < TESTED_VERSION[1]))
    console.warn(
      `build-font-atlas: msdf-atlas-gen v${major}.${minor} is older than ` +
        `v${TESTED_VERSION.join('.')}, which this script was written for. ` +
        'If the atlas looks wrong, update it.'
    );
  return command;
}

function fontPath(face) {
  const file = path.join(fontsDir, 'src', face.file);
  if (!fs.existsSync(file))
    fail(`The source font ${file} is missing. It is in the repository, under fonts/src.`);
  return file;
}

function runTool(command) {
  const args = [];
  FACES.forEach((face, i) => {
    if (i > 0) args.push('-and');
    args.push('-font', fontPath(face), '-fontname', face.name, '-chars', CHARSET);
  });
  args.push(
    '-type', 'mtsdf',
    '-size', String(EM_SIZE),
    '-pxrange', String(DISTANCE_RANGE),
    '-yorigin', 'top',
    '-format', 'png',
    '-imageout', pngFile,
    '-json', jsonFile
  );
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) fail(`msdf-atlas-gen did not run: ${result.error.message}`);
  if (result.status !== 0)
    fail(
      `msdf-atlas-gen stopped with code ${result.status}:\n\n` +
        `${result.stdout}${result.stderr}`.trim()
    );
  for (const file of [pngFile, jsonFile])
    if (!fs.existsSync(file)) fail(`msdf-atlas-gen did not write ${file}.`);
}

/** The GPOS kerning of each pair of glyphs in the atlas, in ems. */
function kerning(face, glyphs) {
  const bytes = fs.readFileSync(fontPath(face));
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  const shapes = glyphs.map((g) => font.charToGlyph(String.fromCodePoint(g.unicode)));
  const pairs = [];
  shapes.forEach((left, a) =>
    shapes.forEach((right, b) => {
      const amount = font.getKerningValue(left, right);
      if (amount)
        pairs.push({
          unicode1: glyphs[a].unicode,
          unicode2: glyphs[b].unicode,
          advance: amount / font.unitsPerEm,
        });
    })
  );
  return pairs;
}

function main() {
  const command = findTool();
  runTool(command);

  const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (json.atlas?.type !== 'mtsdf' || !Array.isArray(json.variants))
    fail(`${jsonFile} is not the JSON this script expects from msdf-atlas-gen.`);
  const codes = charsetCodes();
  FACES.forEach((face, i) => {
    const variant = json.variants[i];
    if (variant?.name !== face.name)
      fail(`The atlas JSON has no "${face.name}" face at index ${i}.`);
    if (!variant.kerning?.length) variant.kerning = kerning(face, variant.glyphs);

    const have = new Set(variant.glyphs.map((g) => g.unicode));
    const missing = codes.filter((c) => !have.has(c));
    console.log(
      `${face.name}: ${variant.glyphs.length} glyphs, ${variant.kerning.length} kerning pairs` +
        (missing.length
          ? `, not in the font: ${missing.map((c) => `U+${c.toString(16)}`).join(' ')}`
          : '')
    );
  });
  fs.writeFileSync(jsonFile, JSON.stringify(json));
  console.log(`Atlas: ${json.atlas.width} × ${json.atlas.height} texels, ${pngFile}`);
}

main();
