/**
 * Builds the Roboto MTSDF atlas that the GPU UI draws text with. It holds the
 * regular and bold faces in one texture.
 *
 *     npm run ui-font
 *
 * Writes `fonts/roboto-msdf.png` and `fonts/roboto-msdf.json`. Commit both,
 * so only someone who changes the atlas needs the tools below.
 *
 * It needs msdf-atlas-gen 1.4 or later. See `msdf-atlas-gen.mjs` for how to
 * install it.
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, findTool, runTool } from './msdf-atlas-gen.mjs';

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

function fontPath(face) {
  const file = path.join(fontsDir, 'src', face.file);
  if (!fs.existsSync(file))
    fail(`The source font ${file} is missing. It is in the repository, under fonts/src.`);
  return file;
}

function buildAtlas(command) {
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
  runTool(command, args, [pngFile, jsonFile]);
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
  buildAtlas(command);

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
