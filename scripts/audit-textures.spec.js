import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import {
  analyseNormalMap,
  auditTextures,
  oversizedTargets,
  probeJpegSampling,
  probeWebp,
  roleOf,
  verdictFor,
} from './audit-textures.js';
import {
  decodeRgb,
  imageMetadata,
  linearToSrgb,
  linearizeInPlace,
  requantiseTo8Bit,
  srgbToLinear,
} from './lib/image.js';

/**
 * Raw RGB bytes of a normal map whose normals are genuinely unit length,
 * stored either straight or gamma-encoded. Shared by the PNG and WebP fixtures
 * so both formats are exercised against identical data.
 */
function normalPixels(size, gammaEncoded) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const angle = (i / (size * size)) * Math.PI * 2;
    const tilt = 0.35 * Math.sin((i / size) * 0.7);
    const x = Math.cos(angle) * tilt;
    const y = Math.sin(angle) * tilt;
    const z = Math.sqrt(Math.max(1e-6, 1 - x * x - y * y));
    const encode = (v) => {
      const stored = v * 0.5 + 0.5;
      return Math.round((gammaEncoded ? linearToSrgb(stored) : stored) * 255);
    };
    pixels[i * 3] = encode(x);
    pixels[i * 3 + 1] = encode(y);
    pixels[i * 3 + 2] = encode(z);
  }
  return pixels;
}

async function writeNormalWebp(path, { gammaEncoded, size = 32 }) {
  await sharp(normalPixels(size, gammaEncoded), {
    raw: { width: size, height: size, channels: 3 },
  })
    .webp({ lossless: true })
    .toFile(path);
}

/** A non-normal data map, used to exercise the format and sibling rules. */
async function writeDataWebp(path, { lossless, size = 32 }) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = 180 + (i % 40);
    pixels[i * 3 + 1] = 120 + (i % 60);
    pixels[i * 3 + 2] = 0;
  }
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .webp({ lossless })
    .toFile(path);
}

// assets/shared is not in version control, so nothing here may depend on it —
// every fixture is synthesised. That also means the fixtures state the
// expectations explicitly, which is what makes a failure legible.

let dir;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-spec-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A normal map as a PNG, at either bit depth. 16-bit needs the colourspace
 * promotion because sharp's raw input is 8-bit.
 */
async function writeNormalPng(path, { gammaEncoded, depth = 8, size = 32 }) {
  let pipeline = sharp(normalPixels(size, gammaEncoded), {
    raw: { width: size, height: size, channels: 3 },
  });
  if (depth === 16) pipeline = pipeline.toColourspace('rgb16');
  await pipeline.png({ compressionLevel: 9 }).toFile(path);
}

/** A JPEG header with chosen sampling factors — enough for the SOF probe. */
function jpegWithSampling(factors) {
  const componentBytes = factors.flatMap(([h, v], i) => [i + 1, (h << 4) | v, 0]);
  const sofLength = 8 + factors.length * 3;
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, skipped by length
    0xff, 0xc0, // SOF0
    (sofLength >> 8) & 0xff, sofLength & 0xff,
    8, // precision
    0x00, 0x20, 0x00, 0x20, // 32x32
    factors.length,
    ...componentBytes,
  ]);
}

describe('roleOf', () => {
  it.each([
    ['forrest_ground_01_norm_1k.png', 'normal'],
    ['TexturesCom_Wall_BlockConcrete4_2x2_B_1K_normal.png', 'normal'],
    ['snow_02_arm_1k.jpg', 'arm'],
    ['snow_02_diff_1k.jpg', 'albedo'],
    ['snow_02_rough_1k.jpg', 'roughness'],
    ['mud_cracked_dry_03_disp_1k.png', 'height'],
    ['some-model.glb', 'unknown'],
  ])('classifies %s as %s', (name, expected) => {
    expect(roleOf(name)).toBe(expected);
  });

  it('prefers ARM over its own component names', async () => {
    // An ARM map contains occlusion, roughness and metallic, so a looser
    // ordering would classify it as whichever pattern happened to match first
    // and then judge it by the wrong rules.
    expect(roleOf('grass_01_arm.jpg')).toBe('arm');
  });
});

describe('probeJpegSampling', () => {
  it('reads 4:2:0, where two channels are stored at half resolution', () => {
    const probe = probeJpegSampling(jpegWithSampling([[2, 2], [1, 1], [1, 1]]));
    expect(probe).toMatchObject({ components: 3, subsampling: '4:2:0' });
  });

  it('reads 4:2:2 and 4:4:4', () => {
    expect(probeJpegSampling(jpegWithSampling([[2, 1], [1, 1], [1, 1]])).subsampling).toBe('4:2:2');
    expect(probeJpegSampling(jpegWithSampling([[1, 1], [1, 1], [1, 1]])).subsampling).toBe('4:4:4');
  });

  it('recognises a single-component file as greyscale', () => {
    expect(probeJpegSampling(jpegWithSampling([[1, 1]])).subsampling).toBe('greyscale');
  });

  it('returns null for something that is not a JPEG', () => {
    expect(probeJpegSampling(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

/**
 * A WebP container carrying the given image chunk. Enough for the probe, which
 * only reads the RIFF framing and the chunk fourccs.
 */
function webpWithChunks(chunks) {
  const body = [];
  for (const [fourcc, payloadSize] of chunks) {
    const chunk = Buffer.alloc(8 + payloadSize + (payloadSize % 2));
    chunk.write(fourcc, 0, 'ascii');
    chunk.writeUInt32LE(payloadSize, 4);
    body.push(chunk);
  }
  const payload = Buffer.concat(body);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + payload.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, payload]);
}

describe('probeWebp', () => {
  it('recognises lossless VP8L', () => {
    expect(probeWebp(webpWithChunks([['VP8L', 32]]))).toEqual({
      lossless: true,
      extended: false,
    });
  });

  it('recognises lossy VP8, which subsamples chroma exactly as JPEG does', () => {
    expect(probeWebp(webpWithChunks([['VP8 ', 32]]))).toEqual({
      lossless: false,
      extended: false,
    });
  });

  it('walks past VP8X and ALPH to find the image chunk in an extended file', async () => {
    // An extended WebP leads with VP8X, so reading only the first chunk would
    // never learn whether the image data is lossy. Odd payload sizes also make
    // this exercise the even-padding rule.
    expect(probeWebp(webpWithChunks([['VP8X', 10], ['ALPH', 7], ['VP8L', 16]]))).toEqual({
      lossless: true,
      extended: true,
    });
  });

  it('returns null for something that is not a WebP', () => {
    expect(probeWebp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('verdictFor', () => {
  it('calls a clear gamma encoding, confidently', () => {
    expect(verdictFor({ asIsUnitShare: 0.03, decodedUnitShare: 0.94 })).toEqual({
      encoding: 'srgb-encoded',
      confident: true,
    });
  });

  it('keeps the direction but drops confidence when neither reading is unit length', async () => {
    // The real forrest_ground_01 case: gamma-encoded, but a downscale shortened
    // the normals so even the correct reading misses unit length.
    expect(verdictFor({ asIsUnitShare: 0.09, decodedUnitShare: 0.25 })).toEqual({
      encoding: 'srgb-encoded',
      confident: false,
    });
  });

  it('refuses to guess when the two readings are within the margin', () => {
    expect(verdictFor({ asIsUnitShare: 0.5, decodedUnitShare: 0.52 }).encoding).toBe('ambiguous');
  });
});

describe('auditTextures', () => {
  let root;

  beforeAll(async () => {
    root = join(dir, 'assets');
    mkdirSync(root, { recursive: true });
    await writeNormalPng(join(root, 'good_norm.png'), { gammaEncoded: false });
    await writeNormalPng(join(root, 'bad_norm.png'), { gammaEncoded: true });
    writeFileSync(join(root, 'thing_arm.jpg'), jpegWithSampling([[2, 2], [1, 1], [1, 1]]));
    writeFileSync(join(root, 'thing_diff.jpg'), jpegWithSampling([[2, 2], [1, 1], [1, 1]]));
    // A backup left by --fix. Auditing it would re-report a problem already
    // fixed, and assets:push excludes it from upload too.
    await writeNormalPng(join(root, 'bad_norm.png.orig'), { gammaEncoded: true });
  });

  it('blocks on a gamma-encoded normal map and offers to convert it', async () => {
    const result = await auditTextures(root);
    const error = result.errors.find((f) => f.shown === 'bad_norm.png');
    expect(error).toBeDefined();
    expect(error.code).toBe('gamma-encoded');
    expect(result.convertible.map((c) => c.shown)).toEqual(['bad_norm.png']);
  });

  it('passes a correctly encoded normal map without comment', async () => {
    const result = await auditTextures(root);
    expect(result.findings.find((f) => f.shown === 'good_norm.png')).toBeUndefined();
  });

  it('warns about a lossy data map without blocking the push', async () => {
    const result = await auditTextures(root);
    const finding = result.findings.find((f) => f.shown === 'thing_arm.jpg');
    expect(finding.severity).toBe('warn');
    expect(finding.detail).toContain('4:2:0');
  });

  it('leaves albedo JPEGs alone — perceptual colour is what JPEG is for', async () => {
    const result = await auditTextures(root);
    expect(result.findings.find((f) => f.shown === 'thing_diff.jpg')).toBeUndefined();
  });

  it('ignores .orig backups', async () => {
    const result = await auditTextures(root);
    expect(result.findings.some((f) => f.shown.endsWith('.orig'))).toBe(false);
  });
});

describe('WebP data maps', () => {
  let root;

  beforeAll(async () => {
    // Real WebP files, not the header stubs the probe tests use — these have to
    // survive an actual decode, which is the whole point of the change that
    // closed this gap.
    root = join(dir, 'webp');
    mkdirSync(join(root, 'good'), { recursive: true });
    mkdirSync(join(root, 'bad'), { recursive: true });

    await writeNormalWebp(join(root, 'good', 'ok_nor_gl_1k.webp'), { gammaEncoded: false });
    await writeDataWebp(join(root, 'good', 'ok_arm_1k.webp'), { lossless: true });

    await writeNormalWebp(join(root, 'bad', 'bad_nor_gl_1k.webp'), { gammaEncoded: true });
    await writeDataWebp(join(root, 'bad', 'bad_arm_1k.webp'), { lossless: true });
    await writeDataWebp(join(root, 'bad', 'bad_disp_1k.webp'), { lossless: true });
    await writeDataWebp(join(root, 'bad', 'bad_diff_1k.webp'), { lossless: false });
    await writeDataWebp(join(root, 'good', 'lossy_arm_1k.webp'), { lossless: false });
  });

  it('measures a WebP normal map instead of deferring on it', async () => {
    // This is the gap that let #204 ship twice: format checked, encoding not.
    const { unverified, findings } = await auditTextures(root);
    expect(unverified).toHaveLength(0);
    expect(findings.some((f) => f.shown.endsWith('ok_nor_gl_1k.webp'))).toBe(false);
  });

  it('blocks on a gamma-encoded WebP normal map', async () => {
    const { errors, convertible } = await auditTextures(root);
    const error = errors.find((f) => f.shown.endsWith('bad_nor_gl_1k.webp'));
    expect(error.code).toBe('gamma-encoded');
    expect(convertible.some((c) => c.file.endsWith('bad_nor_gl_1k.webp'))).toBe(true);
  });

  it('infers the siblings of a gamma-encoded normal map, and says it inferred them', async () => {
    // ARM and displacement have no unit-length invariant, so provenance is the
    // only evidence available — but it has to be labelled as such.
    const { siblings, findings } = await auditTextures(root);
    expect(siblings.map((s) => s.shown.replace(/.*[\\/]/, '')).sort()).toEqual([
      'bad_arm_1k.webp',
      'bad_disp_1k.webp',
    ]);
    expect(siblings.every((s) => s.measured === false)).toBe(true);
    const sibling = findings.find((f) => f.shown.endsWith('bad_arm_1k.webp'));
    expect(sibling.detail).toMatch(/inferred from the batch, not\s+measured/);
  });

  it('does not touch a folder whose normal map reads linear', async () => {
    const { findings } = await auditTextures(root);
    expect(findings.some((f) => f.shown.endsWith('ok_arm_1k.webp'))).toBe(false);
  });

  it('leaves the albedo alone even in a gamma-encoded folder', async () => {
    // Albedo genuinely should be sRGB-encoded — converting it would break the
    // one map type that was right.
    const { findings } = await auditTextures(root);
    expect(findings.some((f) => f.shown.endsWith('bad_diff_1k.webp'))).toBe(false);
  });

  it('flags a lossy WebP data map — it decimates chroma just like JPEG', async () => {
    const { findings } = await auditTextures(root);
    const finding = findings.find((f) => f.shown.endsWith('lossy_arm_1k.webp'));
    expect(finding.code).toBe('lossy-data-map');
    expect(finding.severity).toBe('warn');
  });

  it('classifies Poly Haven _nor_gl_ filenames as normal maps', () => {
    expect(roleOf('aerial_grass_rock_nor_gl_1k.webp')).toBe('normal');
  });
});

describe('linearizeInPlace', () => {
  it('turns a gamma-encoded WebP into one that measures linear, losslessly', async () => {
    const path = join(dir, 'repair_nor_gl_1k.webp');
    await writeNormalWebp(path, { gammaEncoded: true });

    const before = verdictFor(analyseNormalMap(await decodeRgb(path)));
    expect(before.encoding).toBe('srgb-encoded');

    await linearizeInPlace(path, { noBackup: true });

    const after = verdictFor(analyseNormalMap(await decodeRgb(path)));
    expect(after.encoding).toBe('linear');
    expect(after.confident).toBe(true);

    // Still a lossless WebP — repairing a data map by re-encoding it lossily
    // would trade one silent corruption for another.
    expect(probeWebp(readFileSync(path)).lossless).toBe(true);
  });

  it('leaves alpha untouched', async () => {
    const path = join(dir, 'alpha_nor_gl_1k.webp');
    const size = 16;
    const pixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      pixels[i * 4] = 200;
      pixels[i * 4 + 1] = 200;
      pixels[i * 4 + 2] = 250;
      pixels[i * 4 + 3] = 137; // a value the transfer function would move
    }
    await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
      .webp({ lossless: true })
      .toFile(path);

    await linearizeInPlace(path, { noBackup: true });

    const { data, channels } = await decodeRgb(path);
    expect(channels).toBe(4);
    expect(data[3]).toBe(137);
    expect(data[0]).toBeLessThan(200); // colour channels did move
  });
});

describe('precision the renderer cannot receive', () => {
  let root;

  beforeAll(async () => {
    root = join(dir, 'precision');
    mkdirSync(root, { recursive: true });
    await writeNormalPng(join(root, 'deep_norm.png'), { gammaEncoded: false, depth: 16 });
    await writeNormalPng(join(root, 'flat_norm.png'), { gammaEncoded: false, depth: 8 });
    await writeNormalPng(join(root, 'terrain_disp.png'), { gammaEncoded: false, depth: 16 });
  });

  it('flags a 16-bit data map, since ImageBitmap truncates to 8 on decode', async () => {
    const result = await auditTextures(root);
    const finding = result.findings.find((f) => f.shown === 'deep_norm.png');
    expect(finding.code).toBe('wasted-precision');
    expect(finding.severity).toBe('warn');
  });

  it('says nothing about an 8-bit map', async () => {
    const result = await auditTextures(root);
    expect(
      result.findings.some((f) => f.shown === 'flat_norm.png' && f.code === 'wasted-precision')
    ).toBe(false);
  });

  it('requantises normal maps but spares height maps unless asked', async () => {
    // Height is the one role where 16 bits would genuinely matter if the upload
    // path ever grew an r16unorm option, and the backups are local only — so a
    // push after an unasked-for requantise would make the loss permanent.
    const { oversized } = await auditTextures(root);
    expect(oversizedTargets(oversized).map((o) => o.shown)).toEqual(['deep_norm.png']);
    expect(oversizedTargets(oversized, true).map((o) => o.shown).sort()).toEqual([
      'deep_norm.png',
      'terrain_disp.png',
    ]);
  });
});

describe('transfer functions', () => {
  it('round-trips across the full range including the linear toe', () => {
    // Tolerance is one part in a million, not machine epsilon. The sRGB
    // standard's published breakpoints (0.04045 and 0.0031308) are rounded, so
    // its two branches do not join exactly — a round-trip right at the knee is
    // off by ~3e-8 no matter how the functions are written. That is a
    // thousandth of a single 16-bit quantisation level, so it cannot reach a
    // stored sample; anything larger would be a genuine error.
    for (const v of [0, 0.001, 0.0031308, 0.04045, 0.2, 0.5, 0.735, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
    }
  });

  it('decodes a normal map neutral back to 0.5', () => {
    // The measurement the whole audit rests on: mid-grey gamma-encoded is 187,
    // and decoding it must land back on 128 — otherwise a "fixed" normal map
    // would still be tilted.
    expect(srgbToLinear(187 / 255)).toBeCloseTo(0.5, 2);
    expect(Math.round(linearToSrgb(0.5) * 255)).toBe(188);
  });
});

describe('imageMetadata and requantiseTo8Bit', () => {
  it('reports bits per sample without decoding the pixels', async () => {
    const deep = join(dir, 'meta16_nor_gl.png');
    const flat = join(dir, 'meta8_nor_gl.png');
    await writeNormalPng(deep, { gammaEncoded: false, depth: 16 });
    await writeNormalPng(flat, { gammaEncoded: false, depth: 8 });

    expect(await imageMetadata(deep)).toMatchObject({ format: 'png', bitsPerSample: 16 });
    expect(await imageMetadata(flat)).toMatchObject({ format: 'png', bitsPerSample: 8 });
  });

  it('drops a 16-bit file to 8 without changing its format or its values', async () => {
    const path = join(dir, 'requant_nor_gl.png');
    await writeNormalPng(path, { gammaEncoded: false, depth: 16 });
    const before = await decodeRgb(path);

    const result = await requantiseTo8Bit(path, { noBackup: true });
    expect(result).toEqual({ changed: true, format: 'png' });
    expect((await imageMetadata(path)).bitsPerSample).toBe(8);

    // decodeRgb already returns 8-bit samples, so the two are directly
    // comparable — the requantise must not move anything by more than rounding.
    const after = await decodeRgb(path);
    for (let i = 0; i < before.data.length; i += 97) {
      expect(Math.abs(after.data[i] - before.data[i])).toBeLessThanOrEqual(1);
    }
  });

  it('is a no-op on a file that is already 8-bit', async () => {
    const path = join(dir, 'already8_nor_gl.png');
    await writeNormalPng(path, { gammaEncoded: false, depth: 8 });
    const bytesBefore = readFileSync(path);

    expect(await requantiseTo8Bit(path, { noBackup: true })).toEqual({
      changed: false,
      format: 'png',
    });
    expect(readFileSync(path).equals(bytesBefore)).toBe(true);
  });

  it('refuses to re-encode a lossy format rather than compounding its loss', async () => {
    const path = join(dir, 'lossy_nor_gl.jpg');
    await sharp(normalPixels(32, false), { raw: { width: 32, height: 32, channels: 3 } })
      .jpeg()
      .toFile(path);
    await expect(linearizeInPlace(path, { noBackup: true })).rejects.toThrow(/lossy/);
  });
});
