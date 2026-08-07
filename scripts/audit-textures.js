// Texture encoding audit.
//
// Why this exists: a normal map that has been gamma-encoded still loads, still
// mips, still looks like a normal map in an image viewer, and still renders —
// just wrongly. #204 was a full day of chasing a "flashlight bug" that turned
// out to be sixteen terrain normal maps sRGB-encoded on disk, decoding to a
// constant ~35 degree tilt on every texel. Nothing in the pipeline could have
// caught it, because nothing was checking.
//
// The encoding check works because a tangent-space normal map is
// *self-verifying*: every texel must be a unit vector. That is a property of
// the data, so it settles the question without trusting the filename, the
// source site, or the file's own colour chunks — which are wrong in both
// directions in this library.
//
// The format check is the other half. A data map's channels are independent
// numbers, and JPEG does not treat them that way: at 4:2:0 it averages the two
// chroma channels over 2x2 blocks, so an ARM map's roughness and metallic are
// decimated before the shader ever sees them.
//
//   npm run textures:audit               report on assets/shared
//   npm run textures:audit -- <dir>      report on some other tree
//   npm run textures:audit -- --strict   treat warnings as failures too
//   npm run textures:fix                 convert gamma-encoded maps to linear
//
// Exits non-zero when anything blocking is found, which is what lets
// assets-push.js refuse to publish.

import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import { pathToFileURL } from 'url';
import {
  canDecode,
  decodeRgb,
  imageMetadata,
  linearizeInPlace,
  requantiseTo8Bit,
  srgbToLinearByte,
} from './lib/image.js';

const DEFAULT_ROOT = 'assets/shared';

// Filename conventions across the library's sources (Poly Haven, TexturesCom,
// Quixel). Order matters: 'normal' must beat the generic colour patterns, and
// ARM must beat its own component names since an ARM map contains all three.
const ROLE_PATTERNS = [
  ['normal', /(^|[-_])(nor|norm|normal|nrm|normalgl|normaldx)([-_]|\d|$)/i],
  ['arm', /(^|[-_])arm([-_]|\d|$)/i],
  ['albedo', /(^|[-_])(diff|diffuse|albedo|basecolor|base_color|col|color)([-_]|\d|$)/i],
  ['roughness', /(^|[-_])(rough|roughness|rgh)([-_]|\d|$)/i],
  ['metallic', /(^|[-_])(metal|metallic|mtl)([-_]|\d|$)/i],
  ['occlusion', /(^|[-_])(ao|occlusion|occ)([-_]|\d|$)/i],
  ['height', /(^|[-_])(disp|displacement|height|bump)([-_]|\d|$)/i],
];

// Roles whose channels are numbers rather than a picture. Albedo is absent on
// purpose: it is perceptual colour, JPEG is designed for exactly that, and
// insisting on PNG for it would cost download size for no fidelity anyone can
// see.
const DATA_ROLES = new Set(['normal', 'arm', 'roughness', 'metallic', 'occlusion', 'height']);

const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

// A texel counts as unit length within this tolerance. Loose enough to absorb
// 8-bit quantisation and the authoring tool's own rounding, tight enough that a
// whole-image gamma shift cannot hide inside it.
const UNIT_TOLERANCE = 0.05;

// How much better the winning interpretation must be before the tool will name
// a direction at all. Below this the file is reported as ambiguous and left
// alone: being wrong here corrupts an asset that was fine.
const VERDICT_MARGIN = 0.03;

// A verdict is only acted on automatically when the winning reading actually
// produces unit vectors across most of the image. Below this the direction is
// still reported — it is usually right — but a resize or a lossy round-trip has
// shortened the normals enough that the measurement alone should not authorise
// an overwrite. `--include-unsure` is the deliberate override.
const CONFIDENT_SHARE = 0.5;

export const ERROR = 'error';
export const WARN = 'warn';

export function roleOf(file) {
  const name = basename(file, extname(file));
  for (const [role, pattern] of ROLE_PATTERNS) {
    if (pattern.test(name)) return role;
  }
  return 'unknown';
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/**
 * Reads a JPEG's SOF marker for its component sampling factors.
 *
 * No pixel decoding, and none needed: the header alone says whether chroma has
 * been thrown away, which is the difference between "lossy" and "two of these
 * three channels are at half resolution".
 */
export function probeJpegSampling(buffer) {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;

  let pos = 2;
  while (pos < buffer.length - 3) {
    if (buffer[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = buffer[pos + 1];
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const length = buffer.readUInt16BE(pos + 2);
    // Any Start-Of-Frame. The excluded codes in that range are DHT, JPGA and
    // DAC, which are not frame headers.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const components = buffer[pos + 9];
      const factors = [];
      for (let i = 0; i < components; i++) {
        const byte = buffer[pos + 11 + i * 3];
        factors.push({ h: byte >> 4, v: byte & 0x0f });
      }
      if (components === 1) return { components, subsampling: 'greyscale', factors };
      const { h, v } = factors[0];
      const subsampling =
        h === 2 && v === 2 ? '4:2:0' : h === 2 && v === 1 ? '4:2:2' : h === 1 && v === 1 ? '4:4:4' : 'other';
      return { components, subsampling, factors };
    }
    pos += 2 + length;
  }
  return null;
}

/**
 * Reads a WebP container for whether the image data is lossless or lossy.
 *
 * This matters as much as the JPEG check and for the same reason: lossy WebP is
 * YUV with 4:2:0 chroma, so it decimates two of three channels exactly as JPEG
 * does. "We moved to WebP" is only an improvement for a data map if it is the
 * lossless variant, and the extension does not say which.
 *
 * Layout: 'RIFF' <size> 'WEBP' then chunks. A simple file's first chunk is
 * 'VP8 ' (lossy) or 'VP8L' (lossless); an extended file leads with 'VP8X' and
 * the image data follows in a later chunk, so that case is scanned.
 */
export function probeWebp(buffer) {
  if (buffer.length < 16) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  let pos = 12;
  let extended = false;
  while (pos + 8 <= buffer.length) {
    const fourcc = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);

    if (fourcc === 'VP8L') return { lossless: true, extended };
    if (fourcc === 'VP8 ') return { lossless: false, extended };
    if (fourcc === 'VP8X') extended = true;

    // Chunk payloads are padded to an even length.
    pos += 8 + size + (size % 2);
  }
  return { lossless: null, extended };
}

/**
 * Scores both readings of a normal map against the unit-length constraint.
 *
 * Returns the share of texels that come out unit length under each, plus the
 * mean vector length — the share decides, the mean is what makes the answer
 * legible to a human reading the report.
 */
export function analyseNormalMap(image) {
  const texels = image.width * image.height;
  const { channels, data } = image;
  let asIsUnit = 0;
  let decodedUnit = 0;
  let asIsLengthSum = 0;
  let decodedLengthSum = 0;

  for (let i = 0; i < texels; i++) {
    const base = i * channels;
    const rb = data[base];
    const gb = data[base + 1];
    const bb = data[base + 2];

    const asIs = Math.hypot((rb / 255) * 2 - 1, (gb / 255) * 2 - 1, (bb / 255) * 2 - 1);
    asIsLengthSum += asIs;
    if (Math.abs(asIs - 1) <= UNIT_TOLERANCE) asIsUnit++;

    const decoded = Math.hypot(
      srgbToLinearByte(rb) * 2 - 1,
      srgbToLinearByte(gb) * 2 - 1,
      srgbToLinearByte(bb) * 2 - 1
    );
    decodedLengthSum += decoded;
    if (Math.abs(decoded - 1) <= UNIT_TOLERANCE) decodedUnit++;
  }

  return {
    asIsUnitShare: asIsUnit / texels,
    decodedUnitShare: decodedUnit / texels,
    asIsMeanLength: asIsLengthSum / texels,
    decodedMeanLength: decodedLengthSum / texels,
  };
}

/**
 * Splits the answer into two independent questions, because conflating them
 * was actively misleading: *which* reading is right, and *how sure* the
 * measurement is. A map softened by a downscale has short normals under either
 * reading — that lowers confidence, but the direction stays just as clear.
 */
export function verdictFor(scores) {
  const { asIsUnitShare, decodedUnitShare } = scores;
  const gap = decodedUnitShare - asIsUnitShare;

  if (Math.abs(gap) < VERDICT_MARGIN) {
    return { encoding: 'ambiguous', confident: false };
  }
  return {
    encoding: gap > 0 ? 'srgb-encoded' : 'linear',
    confident: Math.max(asIsUnitShare, decodedUnitShare) >= CONFIDENT_SHARE,
  };
}

/**
 * Which 16-bit files `--to-8bit` will actually rewrite. Exported so the choice
 * is testable rather than buried in the CLI.
 */
export function oversizedTargets(oversized, includeHeight = false) {
  return oversized.filter((o) => o.role === 'normal' || (includeHeight && o.role === 'height'));
}

function percent(x) {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * Inspects a tree and returns findings. Pure of side effects and of process
 * exit, so assets-push.js can gate on it and tests can drive it.
 */
export async function auditTextures(root = DEFAULT_ROOT) {
  const findings = [];
  const convertible = [];
  const unsure = [];
  const oversized = [];
  const unverified = [];
  const siblings = [];
  const unsureSiblings = [];
  const gammaFolders = new Set();
  const unsureFolders = new Set();
  let normalMapsChecked = 0;

  for (const file of walk(root).sort()) {
    // Backups left by --fix. They are excluded from assets:push too, and
    // auditing them would re-report every problem that was already fixed.
    if (file.endsWith('.orig')) continue;

    const role = roleOf(file);
    const shown = relative(root, file);
    const extension = extname(file).toLowerCase();

    // --- Format: data maps must not be stored lossily ----------------------
    if (DATA_ROLES.has(role) && JPEG_EXTENSIONS.has(extension)) {
      const sampling = probeJpegSampling(readFileSync(file));
      const kind = sampling?.subsampling ?? 'unknown';
      const detail =
        kind === '4:2:0' || kind === '4:2:2'
          ? `JPEG ${kind} — the second and third channels are stored at reduced ` +
            `resolution, so for an ARM map that is roughness and metallic averaged ` +
            `across neighbouring texels`
          : kind === 'greyscale'
            ? `JPEG greyscale — no chroma loss, but DCT ringing still perturbs the values`
            : `JPEG ${kind} — lossy, and these channels are numbers rather than a picture`;
      findings.push({ file, shown, role, severity: WARN, code: 'lossy-data-map', detail });
    }

    if (DATA_ROLES.has(role) && extension === '.webp') {
      const webp = probeWebp(readFileSync(file));
      if (!webp || webp.lossless === null) {
        findings.push({
          file, shown, role, severity: WARN, code: 'unreadable',
          detail: 'WebP container has no VP8/VP8L chunk this script recognises',
        });
      } else if (!webp.lossless) {
        findings.push({
          file, shown, role, severity: WARN, code: 'lossy-data-map',
          detail:
            `lossy WebP — YUV with 4:2:0 chroma, so it decimates two of three ` +
            `channels exactly as JPEG does. Re-encode losslessly (cwebp -lossless)`,
        });
      }
    }

    // --- Precision the renderer cannot receive -----------------------------
    // Everything is uploaded through `ImageBitmap` into an rgba8unorm texture
    // (BitmapTexture / TextureArray), and an ImageBitmap is 8 bits per channel.
    // A 16-bit source therefore costs download size for precision that is
    // discarded during decode, before the GPU sees it.
    //
    // Header-only, so gating a push does not pay to inflate every image.
    if (DATA_ROLES.has(role) && canDecode(extension)) {
      try {
        const header = await imageMetadata(file);
        if (header.bitsPerSample === 16) {
          const megabytes = statSync(file).size / 1048576;
          oversized.push({ file, shown, role });
          findings.push({
            file, shown, role, severity: WARN, code: 'wasted-precision',
            detail:
              `16-bit ${header.format} (${megabytes.toFixed(2)} MB), but the upload path is ` +
              `rgba8unorm via ImageBitmap — the extra bits are dropped during ` +
              `decode, so this is download size the renderer cannot use`,
          });
        }
      } catch (error) {
        findings.push({ file, shown, role, severity: WARN, code: 'unreadable', detail: error.message });
      }
    }

    // --- Encoding: normal maps must be unit length -------------------------
    if (role !== 'normal') continue;

    if (!canDecode(extension)) {
      unverified.push({ file, shown, role, reason: `${extension} — no decoder` });
      continue;
    }

    let image;
    try {
      image = await decodeRgb(file);
    } catch (error) {
      findings.push({ file, shown, role, severity: WARN, code: 'unreadable', detail: error.message });
      continue;
    }

    if (image.channels < 3) {
      findings.push({
        file, shown, role, severity: WARN, code: 'not-a-normal-map',
        detail: 'greyscale — a tangent-space normal map needs three channels',
      });
      continue;
    }

    normalMapsChecked++;
    const scores = analyseNormalMap(image);
    const { encoding, confident } = verdictFor(scores);
    const measurement =
      `unit as-is ${percent(scores.asIsUnitShare)} (|n| ${scores.asIsMeanLength.toFixed(3)}), ` +
      `sRGB-decoded ${percent(scores.decodedUnitShare)} (|n| ${scores.decodedMeanLength.toFixed(3)})`;

    if (encoding === 'srgb-encoded' && confident) {
      findings.push({
        file, shown, role, severity: ERROR, code: 'gamma-encoded',
        detail: `decodes to a constant tilt on every texel — ${measurement}`,
      });
      convertible.push({ file, shown, measured: true });
      gammaFolders.add(dirname(file));
    } else if (encoding === 'srgb-encoded') {
      findings.push({
        file, shown, role, severity: WARN, code: 'gamma-encoded-unsure',
        detail: `reads gamma-encoded, but neither reading is cleanly unit length ` +
          `(likely softened by a downscale) — ${measurement}`,
      });
      unsure.push({ file, shown, measured: true });
      unsureFolders.add(dirname(file));
    } else if (encoding === 'ambiguous') {
      findings.push({
        file, shown, role, severity: WARN, code: 'ambiguous',
        detail: `the two readings are too close to call — ${measurement}`,
      });
    } else if (!confident) {
      findings.push({
        file, shown, role, severity: WARN, code: 'short-normals',
        detail: `reads linear, but only ${percent(scores.asIsUnitShare)} of texels are ` +
          `unit length — ${measurement}`,
      });
    }
  }

  // --- Siblings of a gamma-encoded normal map ------------------------------
  // ARM and displacement have no invariant to test against — there is no
  // "must be unit length" for a roughness value. But they are exported in the
  // same batch with the same settings as the normal map beside them, so a
  // folder whose normal map is gamma-encoded has data maps that are too.
  //
  // Inferred, not measured, and reported as such. It is safe to act on because
  // it is self-limiting: once the normal map converts, the folder stops being
  // flagged, so a second run cannot double-convert.
  for (const file of walk(root).sort()) {
    if (file.endsWith('.orig')) continue;
    const role = roleOf(file);
    if (role === 'normal' || !DATA_ROLES.has(role)) continue;
    const folder = dirname(file);
    const confident = gammaFolders.has(folder);
    if (!confident && !unsureFolders.has(folder)) continue;
    if (!canDecode(extname(file).toLowerCase())) continue;
    if (JPEG_EXTENSIONS.has(extname(file).toLowerCase())) continue; // lossy; re-encoding would compound it

    const shown = relative(root, file);
    findings.push({
      file, shown, role,
      severity: confident ? ERROR : WARN,
      code: 'gamma-encoded-sibling',
      detail:
        `exported alongside a normal map that reads gamma-encoded` +
        (confident ? '' : ' (at lower confidence)') +
        `, so this carries the same transform — inferred from the batch, not ` +
        `measured, since a ${role} map has no unit-length invariant to test`,
    });
    (confident ? siblings : unsureSiblings).push({ file, shown, measured: false });
  }

  return {
    findings,
    convertible,
    siblings,
    unsure,
    unsureSiblings,
    oversized,
    unverified,
    normalMapsChecked,
    errors: findings.filter((f) => f.severity === ERROR),
    warnings: findings.filter((f) => f.severity === WARN),
  };
}

/** Prints a report. Returns nothing; the caller decides what to do about it. */
export function reportAudit(result, { root, quiet = false } = {}) {
  const { findings, errors, warnings, unverified, normalMapsChecked } = result;

  if (!quiet) {
    console.log(`\nTexture audit — ${root}`);
    console.log(
      `${normalMapsChecked} normal map(s) checked for encoding; every data map ` +
        `checked for lossy storage.\n`
    );
  }

  if (unverified.length) {
    // Deliberately above the findings rather than below. A finding is something
    // the audit knows about; this is the audit admitting it cannot see, which
    // is more important to notice and easier to forget.
    console.log(`  NOT VERIFIED (${unverified.length}) — encoding unchecked:`);
    for (const u of unverified) console.log(`    ${u.shown} — ${u.reason}`);
    console.log(
      `    The unit-length check is what catches a gamma-encoded normal map, and\n` +
        `    it needs pixels. These formats are not decoded here, so for them the\n` +
        `    gate is checking format only. A WebP decoder would close this.\n`
    );
  }

  if (!findings.length) {
    console.log(unverified.length ? '  No findings.\n' : '  All clear.\n');
    return;
  }

  for (const severity of [ERROR, WARN]) {
    const group = findings.filter((f) => f.severity === severity);
    if (!group.length) continue;
    console.log(`  ${severity === ERROR ? 'BLOCKING' : 'WARNINGS'} (${group.length}):`);
    for (const f of group) {
      console.log(`    ${f.shown}`);
      console.log(`      ${f.code}: ${f.detail}`);
    }
    console.log('');
  }

  console.log(`  ${errors.length} blocking, ${warnings.length} warning(s).`);
}

async function main(argv) {
  const fix = argv.includes('--fix');
  const to8Bit_ = argv.includes('--to-8bit');
  const strict = argv.includes('--strict');
  const noBackup = argv.includes('--no-backup');
  const includeUnsure = argv.includes('--include-unsure');
  const includeHeight = argv.includes('--include-height');
  const root = argv.find((a) => !a.startsWith('--')) ?? DEFAULT_ROOT;

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`No such directory: ${root}`);
    console.error('Run `npm run assets:pull` first, or pass a path.');
    process.exit(2);
  }

  const result = await auditTextures(root);
  reportAudit(result, { root });

  const toConvert = includeUnsure
    ? [...result.convertible, ...result.siblings, ...result.unsure, ...result.unsureSiblings]
    : [...result.convertible, ...result.siblings];

  if (fix && toConvert.length) {
    console.log('');
    for (const { file, shown, measured } of toConvert) {
      const { format } = await linearizeInPlace(file, { noBackup });
      console.log(
        `  converted  ${shown}  (${format}${measured ? '' : ', inferred from its folder'}` +
          `${noBackup ? '' : ', original kept as .orig'})`
      );
    }
    console.log(
      `\nConverted ${toConvert.length} file(s) to linear. Re-run the audit to ` +
        `confirm, then \`npm run assets:push\`.`
    );
    return;
  }

  if (to8Bit_) {
    // Height maps are excluded by default even though they waste exactly the
    // same bits. Normal maps at 8 bits are the industry norm and there is no
    // plausible future in which this engine wants 16-bit normals — whereas
    // displacement is the one map type where the precision would genuinely
    // matter if the upload path ever grew an r16unorm option, and the .orig
    // backups are local only, so a push would make the loss permanent.
    const targets = oversizedTargets(result.oversized, includeHeight);
    if (!targets.length) {
      console.log('\n  Nothing to requantise.');
      return;
    }

    console.log('');
    let before = 0;
    let after = 0;
    for (const { file, shown } of targets) {
      before += statSync(file).size;
      await requantiseTo8Bit(file, { noBackup });
      after += statSync(file).size;
      console.log(`  requantised  ${shown}`);
    }

    const saved = (before - after) / 1048576;
    console.log(
      `\nRequantised ${targets.length} file(s) to 8-bit: ` +
        `${(before / 1048576).toFixed(1)} MB down to ${(after / 1048576).toFixed(1)} MB, ` +
        `saving ${saved.toFixed(1)} MB of download for an identical rendered result.`
    );
    if (!includeHeight) {
      const heights = result.oversized.filter((o) => o.role === 'height').length;
      if (heights) {
        console.log(
          `  ${heights} height map(s) left at 16-bit on purpose — see the comment ` +
            `in this script. Add --include-height to take them too.`
        );
      }
    }
    return;
  }

  const sure = result.convertible.length + result.siblings.length;
  const maybe = result.unsure.length + result.unsureSiblings.length;
  if (sure || maybe) {
    console.log(
      `\n  \`npm run textures:fix\` converts ${sure} of these to linear` +
        (result.siblings.length
          ? ` (${result.siblings.length} inferred from their folder)`
          : '') +
        '.' +
        (maybe ? ` Add --include-unsure for ${maybe} more at lower confidence.` : '')
    );
  }
  if (result.warnings.some((w) => w.code === 'lossy-data-map')) {
    console.log(
      `\n  Lossy data maps cannot be repaired by re-encoding — the information is ` +
        `already gone. They need re-exporting from source as PNG.\n` +
        `  They are warnings rather than blocking so a pre-existing library does ` +
        `not wedge every push; run with --strict once they are dealt with.`
    );
  }

  const blocking = result.errors.length + (strict ? result.warnings.length : 0);
  if (blocking) process.exitCode = 1;
}

// Only run as a CLI. assets-push.js imports auditTextures() from here, and an
// import must not audit anything by itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Not top-level await: the jest transform compiles this module to CJS, where
  // that is a syntax error. A .catch is what this wanted anyway — a rejection
  // here would otherwise surface as a bare stack trace mid-conversion.
  main(process.argv.slice(2)).catch((error) => {
    console.error(`\nTexture audit failed: ${error.message}`);
    process.exit(1);
  });
}
