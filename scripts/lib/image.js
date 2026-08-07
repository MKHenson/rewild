// Image IO for the texture audit, on top of sharp.
//
// It exists because the audit was blind to WebP, and that blindness shipped the
// #204 defect a second time. A check the pipeline cannot run on the files the
// pipeline actually carries is not a check.
//
// This is deliberately the *only* decode path. An earlier version kept a
// hand-rolled PNG codec alongside it, which meant PNG normal maps were measured
// through one implementation and WebP ones through another — the kind of split
// where a fix lands on one side and not the other. sharp reads every format the
// library uses and reports bit depth from the header, so there is nothing left
// for a second codec to do.

import { renameSync, existsSync, readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

// Every read goes through a Buffer rather than a path. Handed a filename, sharp
// keeps the file open behind a lazy pipeline, and on Windows that makes the
// rename-to-.orig fail with EBUSY — the backup this module depends on for its
// only undo. Buffers also make the caching below irrelevant to correctness.
sharp.cache(false);

function readAsSharp(path) {
  return sharp(readFileSync(path));
}

const SUPPORTED = new Set(['.png', '.webp', '.jpg', '.jpeg']);

export function canDecode(extension) {
  return SUPPORTED.has(extension);
}

// 8-bit is all the unit-length measurement needs, and it is what the renderer
// receives anyway — the upload path is rgba8unorm through ImageBitmap.
const SRGB_TO_LINEAR_8 = new Uint8Array(256);
const SRGB_TO_LINEAR_F = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const s = i / 255;
  const linear = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  SRGB_TO_LINEAR_F[i] = linear;
  SRGB_TO_LINEAR_8[i] = Math.round(linear * 255);
}

/** Raw 8-bit samples, whatever the container. */
export async function decodeRgb(path) {
  const { data, info } = await readAsSharp(path).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

/** The sRGB decode of a 0-255 sample, as 0..1. Table-driven; called per texel. */
export function srgbToLinearByte(byte) {
  return SRGB_TO_LINEAR_F[byte];
}

/** sRGB electro-optical transfer function — encoded 0..1 to linear 0..1. */
export function srgbToLinear(s) {
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** The inverse. Used to build gamma-encoded fixtures, and for round-trip tests. */
export function linearToSrgb(l) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

/**
 * Header-only inspection: format, dimensions, channels and bits per sample.
 *
 * Bit depth is reported in bits rather than sharp's `'uchar'`/`'ushort'` so
 * callers can reason about it numerically. Reading a header costs well under a
 * millisecond, which matters because the audit gates every asset push.
 */
export async function imageMetadata(path) {
  const m = await readAsSharp(path).metadata();
  return {
    format: m.format,
    width: m.width,
    height: m.height,
    channels: m.channels,
    bitsPerSample: m.depth === 'uchar' ? 8 : m.depth === 'ushort' ? 16 : null,
  };
}

/**
 * Rewrites a 16-bit image at 8 bits per sample, in the format it already is.
 *
 * Worth doing only where the extra bits are already being discarded downstream:
 * the renderer uploads through `ImageBitmap`, which is 8 bits per channel, so
 * 16-bit source files cost download size for precision the GPU never receives.
 */
export async function requantiseTo8Bit(path, { noBackup = false } = {}) {
  const metadata = await readAsSharp(path).metadata();
  if (metadata.depth !== 'ushort') return { changed: false, format: metadata.format };

  // toColourspace is what actually drops the precision; the encoder then writes
  // whatever depth the pipeline is carrying.
  const target = metadata.channels >= 3 ? 'srgb' : 'b-w';
  let pipeline = readAsSharp(path).toColourspace(target);
  if (metadata.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (metadata.format === 'webp') pipeline = pipeline.webp({ lossless: true, effort: 6 });
  else throw new Error(`${path}: refusing to re-encode ${metadata.format} — it is lossy`);

  const encoded = await pipeline.toBuffer();

  if (!noBackup) {
    const backup = `${path}.orig`;
    if (!existsSync(backup)) renameSync(path, backup);
  }
  writeFileSync(path, encoded);
  return { changed: true, format: metadata.format };
}

/**
 * Rewrites a gamma-encoded data map as linear, in the format it already is.
 *
 * Alpha is left alone — it is not part of the transfer function. WebP is
 * re-encoded losslessly, because re-encoding a data map lossily would trade one
 * silent corruption for another.
 *
 * The original is moved to `.orig` first: assets/shared is not in version
 * control, so this is the only undo.
 */
export async function linearizeInPlace(path, { noBackup = false } = {}) {
  const metadata = await readAsSharp(path).metadata();
  const { data, info } = await readAsSharp(path)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colourChannels = Math.min(3, info.channels);
  const texels = info.width * info.height;
  for (let i = 0; i < texels; i++) {
    const base = i * info.channels;
    for (let c = 0; c < colourChannels; c++) {
      data[base + c] = SRGB_TO_LINEAR_8[data[base + c]];
    }
  }

  // Everything is buffered by now, so moving the source aside is safe.
  if (!noBackup) {
    const backup = `${path}.orig`;
    if (!existsSync(backup)) renameSync(path, backup);
  }

  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
  let out = sharp(data, raw);
  if (metadata.format === 'webp') out = out.webp({ lossless: true, effort: 6 });
  else if (metadata.format === 'png') out = out.png({ compressionLevel: 9 });
  else throw new Error(`${path}: refusing to re-encode ${metadata.format} — it is lossy`);

  await out.toFile(path);
  return { format: metadata.format, width: info.width, height: info.height };
}
