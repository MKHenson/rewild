// The source loader, against sources it writes itself.
//
// The real ones under `sources/` are gitignored art, so nothing here may depend
// on them — a fresh clone has none and these still have to run.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';

// sharp keeps a descriptor cache on files it has read, which on Windows holds
// every fixture open past its test: the temp folder cannot be removed and jest
// cannot exit. Nothing here reads a file twice, so the cache buys nothing.
sharp.cache(false);
import {
  fitLeaves,
  leafGrid,
  loadBarkSource,
  loadLeafSource,
  normalStrength,
  stampsPerCell,
  tileRepeats,
  type BarkSource,
  type LeafSource,
} from './lib/sources.ts';

const SIZE = 8;

/**
 * A 16-bit greyscale PNG, written by hand.
 *
 * sharp cannot make the fixture: it ignores `depth` on a raw *input* buffer and
 * reads the bytes as 8-bit, so every value comes back as a neighbouring pair
 * scaled by 257. A test for 16-bit precision cannot be built out of a writer
 * that does not have any.
 */
function png16(samples: number[], size: number): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 0; // greyscale

  // One filter byte per row, then big-endian samples.
  const raw = Buffer.alloc(size * (1 + size * 2));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 2);
    for (let x = 0; x < size; x++) raw.writeUInt16BE(samples[y * size + x], row + 1 + x * 2);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writeSource(
  root: string,
  name: string,
  options: { metadata?: unknown; dispDepth?: 8 | 16; heights?: number[] } = {}
): Promise<string> {
  const directory = join(root, 'bark', name);
  await mkdir(directory, { recursive: true });

  const rgb = Buffer.alloc(SIZE * SIZE * 3, 128);
  const raw = { raw: { width: SIZE, height: SIZE, channels: 3 as const } };
  await sharp(rgb, raw).webp({ lossless: true }).toFile(join(directory, `${name}-diff.webp`));
  await sharp(rgb, raw).webp({ lossless: true }).toFile(join(directory, `${name}-arm.webp`));

  const depth = options.dispDepth ?? 16;
  if (depth === 16) {
    const samples: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i++)
      samples.push(options.heights ? options.heights[i % options.heights.length] : i * 37);
    await writeFile(join(directory, `${name}-disp.png`), png16(samples, SIZE));
  } else {
    await sharp(Buffer.alloc(SIZE * SIZE, 200), { raw: { width: SIZE, height: SIZE, channels: 1 } })
      .png()
      .toFile(join(directory, `${name}-disp.png`));
  }

  const metadata = options.metadata ?? { widthMetres: 1.2, depthMetres: 0.03 };
  await writeFile(join(directory, 'source.json'), JSON.stringify(metadata));

  return directory;
}

/**
 * A leaf stamp: a green bar two texels wide down the middle of the image, from
 * row 1 to row 6, over black. Black under the alpha is what a real source has
 * and what the loader's extent and the compositor's weighting are tested against.
 */
async function writeStamp(
  root: string,
  name: string,
  options: { prefix?: string; metadata?: unknown; alpha?: boolean; extra?: string } = {}
): Promise<string> {
  const directory = join(root, 'leaves', name);
  await mkdir(directory, { recursive: true });
  const prefix = options.prefix ?? name;
  const alpha = options.alpha ?? true;
  const channels = alpha ? 4 : 3;

  const rgba = Buffer.alloc(SIZE * SIZE * channels, 0);
  for (let y = 1; y <= 6; y++)
    for (const x of [3, 4]) {
      const i = (y * SIZE + x) * channels;
      rgba[i + 1] = 128;
      if (alpha) rgba[i + 3] = 255;
    }
  const raw = { raw: { width: SIZE, height: SIZE, channels: channels as 3 | 4 } };
  await sharp(rgba, raw).webp({ lossless: true }).toFile(join(directory, `${prefix}-diff.webp`));
  await sharp(Buffer.alloc(SIZE * SIZE * 3, 200), { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .webp({ lossless: true })
    .toFile(join(directory, `${prefix}-arm.webp`));
  await writeFile(join(directory, `${prefix}-disp.png`), png16(Array.from({ length: SIZE * SIZE }, (_, i) => i * 37), SIZE));

  const metadata = options.metadata ?? { lengthMetres: 0.1 };
  await writeFile(join(directory, 'source.json'), JSON.stringify(metadata));

  return directory;
}

describe('bark sources', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tree-forge-sources-'));
  });

  afterAll(async () => {
    // Windows keeps a handle on the images sharp read for a moment after, and a
    // temp directory that outlives the run is not a failing test.
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* the OS will get to it */
    }
  });

  it('generates when no source is listed, and refuses one that is not there', async () => {
    // The fallback rests on an empty list being null rather than a throw. A
    // listed name that is missing is the opposite case: art the tree asked
    // for and did not get is a stopped run, not a silent generator.
    expect(await loadBarkSource([], root)).toBeNull();
    await expect(loadBarkSource(['nothing-here'], root)).rejects.toThrow(/No bark source 'nothing-here'/);
  });

  it('takes one bark for now', async () => {
    await expect(loadBarkSource(['a', 'b'], root)).rejects.toThrow(/more than one bark/);
  });

  it('carries a 16-bit height through at full precision', async () => {
    // Every sharp route but toColourspace('grey16') silently hands back the
    // 8-bit downconversion, which would quietly undo the one requirement the
    // derived normals depend on. These values do not survive 8 bits.
    const heights = [1, 2, 3, 40000, 40001, 40002, 65535, 0];
    await writeSource(root, 'precise', { heights });

    const source = await loadBarkSource(['precise'], root);
    expect(source).not.toBeNull();

    const seen = new Set(Array.from(source!.height, (v) => Math.round(v * 65535)));
    for (const h of heights) expect(seen.has(h)).toBe(true);
    // Adjacent values a byte apart would collapse into each other at 8 bits.
    expect(seen.has(40000) && seen.has(40001) && seen.has(40002)).toBe(true);
  });

  it('refuses an 8-bit height rather than terracing quietly', async () => {
    await writeSource(root, 'shallow', { dispDepth: 8 });
    await expect(loadBarkSource(['shallow'], root)).rejects.toThrow(/not 16-bit/);
  });

  it('refuses a source that does not say how big it is', async () => {
    await writeSource(root, 'sizeless', { metadata: { widthMetres: 1 } });
    await expect(loadBarkSource(['sizeless'], root)).rejects.toThrow(/depthMetres/);
  });

  it('names the map a half-built source is missing', async () => {
    const directory = join(root, 'bark', 'partial');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'source.json'), JSON.stringify({ widthMetres: 1, depthMetres: 0.1 }));

    // Not null. A folder that exists and is wrong must stop the run, or the art
    // silently does nothing and the generator's output looks like a bug.
    await expect(loadBarkSource(['partial'], root)).rejects.toThrow(/-diff map/);
  });
});

describe('leaf sources', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tree-forge-leaves-'));
  });

  afterAll(async () => {
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* the OS will get to it */
    }
  });

  it('generates when no source is listed, and refuses one that is not there', async () => {
    expect(await loadLeafSource([], root)).toBeNull();
    await expect(loadLeafSource(['nothing-here'], root)).rejects.toThrow(/No leaf source 'nothing-here'/);
  });

  it('reads a stamp with its extent off the alpha, in linear light', async () => {
    await writeStamp(root, 'one');
    const source = await loadLeafSource(['one'], root);
    expect(source).not.toBeNull();
    expect(source!.stamps).toHaveLength(1);
    expect(source!.lengthMetres).toBe(0.1);
    expect(source!.stamps[0].lengthMetres).toBe(0.1);
    expect(source!.depthMetres).toBeNull();

    // The declared length maps onto the cutout, not onto the image: a stamp
    // with margin around its leaf is not a longer leaf.
    const [stamp] = source!.stamps;
    expect(stamp.extent).toEqual({ left: 3, right: 4, top: 1, bottom: 6 });

    // 128 in sRGB is 0.216 in linear. Stored straight, the blend between two
    // stamps would happen in display space, which is the mistake this exists
    // to make unrepresentable.
    const i = 3 * SIZE + 3;
    expect(stamp.alpha[i]).toBe(1);
    expect(stamp.albedo[i * 3 + 1]).toBeCloseTo(0.2158, 3);
    expect(stamp.height[i]).toBeCloseTo((i * 37) / 65535, 6);
  });

  it('takes every map set in the folder as a stamp, in name order', async () => {
    await writeStamp(root, 'many', { prefix: 'b' });
    await writeStamp(root, 'many', { prefix: 'a' });
    const source = await loadLeafSource(['many'], root);
    expect(source!.stamps.map((stamp) => stamp.name)).toEqual(['many/a', 'many/b']);
  });

  it('merges several folders into one set, each stamp keeping its own length', async () => {
    // Two species on one card: the layout is sized by the longest and every
    // stamp lands at its own declared size, so a poplar leaf beside an oak
    // leaf is still a poplar leaf's size.
    await writeStamp(root, 'small', { metadata: { lengthMetres: 0.05 } });
    await writeStamp(root, 'large', { metadata: { lengthMetres: 0.2, depthMetres: 0.001 } });
    const source = await loadLeafSource(['small', 'large'], root);

    expect(source!.names).toEqual(['small', 'large']);
    expect(source!.stamps.map((stamp) => stamp.lengthMetres)).toEqual([0.05, 0.2]);
    expect(source!.lengthMetres).toBe(0.2);
    expect(source!.depthMetres).toBe(0.001);
  });

  it('refuses a stamp with no alpha, since the alpha is the leaf', async () => {
    await writeStamp(root, 'solid', { alpha: false });
    await expect(loadLeafSource(['solid'], root)).rejects.toThrow(/no alpha/);
  });

  it('refuses a source that does not say how long its leaf is', async () => {
    await writeStamp(root, 'sizeless', { metadata: { depthMetres: 0.001 } });
    await expect(loadLeafSource(['sizeless'], root)).rejects.toThrow(/lengthMetres/);
  });

  it('names the map a half-built stamp is missing', async () => {
    const directory = join(root, 'leaves', 'partial');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'source.json'), JSON.stringify({ lengthMetres: 0.1 }));
    await sharp(Buffer.alloc(SIZE * SIZE * 4, 255), { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .webp({ lossless: true })
      .toFile(join(directory, 'partial-diff.webp'));

    await expect(loadLeafSource(['partial'], root)).rejects.toThrow(/partial-arm map/);
  });
});

describe('leaf fit', () => {
  const stampOf = (lengthMetres: number) => ({ lengthMetres, extent: { left: 0, right: 3, top: 0, bottom: 63 } });
  const oak = { lengthMetres: 0.1, depthMetres: null, stamps: [stampOf(0.1)] } as unknown as LeafSource;
  const palm = { lengthMetres: 3, depthMetres: null, stamps: [stampOf(3)] } as unknown as LeafSource;

  it('derives the grid from how many leaves fit the card', () => {
    // Many small leaves compose a cluster, and clusters vary; one frond per
    // card has nothing to vary and needs the texels instead.
    expect(leafGrid(oak, 1)).toBe(4);
    expect(leafGrid(oak, 0.3)).toBe(2);
    expect(leafGrid(palm, 3)).toBe(1);
    expect(leafGrid(null, 1)).toBe(4);
  });

  it('still gives a frond a second row when there are several to show', () => {
    const set = { ...palm, stamps: [stampOf(3), stampOf(3)] } as unknown as LeafSource;
    expect(leafGrid(set, 3)).toBe(2);
  });

  it('never fits less than one leaf to a card', () => {
    // A leaf longer than its card fills the card rather than spilling off it.
    expect(stampsPerCell(palm, 1)).toBe(1);
    expect(stampsPerCell(oak, 1)).toBeCloseTo(10, 6);
  });

  it('measures the texels a stamp lands with against the texels it has', () => {
    const fit = fitLeaves(oak, 1, 1024);
    // A 1024 image on a 4x4 grid is 256 a cell, 240 inside the gutter, and a
    // tenth of that per leaf.
    expect(fit.grid).toBe(4);
    expect(fit.placedPx).toBeCloseTo(24, 6);
    expect(fit.sourcePx).toBe(64);
    expect(fit.bumpStrength).toBeNull();

    // Declared depth gives the normal a real gradient, scaled with the texels
    // a card is given the same way bark's is.
    const deep = { ...oak, depthMetres: 0.002 } as unknown as LeafSource;
    expect(fitLeaves(deep, 1, 2048).bumpStrength).toBeCloseTo(fitLeaves(deep, 1, 1024).bumpStrength! * 2, 6);
  });
});

describe('bark scale', () => {
  const source = { widthMetres: 1, depthMetres: 0.04, size: 1024 } as BarkSource;

  it('fits a whole number of tiles around the trunk', () => {
    // A fraction of a tile would leave the ring's seam meeting a different part
    // of the image than it left.
    for (const radius of [0.1, 0.32, 0.72, 2]) {
      const repeats = tileRepeats(source, radius);
      expect(Number.isInteger(repeats)).toBe(true);
      expect(repeats).toBeGreaterThanOrEqual(1);
      // Within half a tile of the true circumference.
      expect(Math.abs(repeats - (2 * Math.PI * radius) / source.widthMetres)).toBeLessThanOrEqual(0.5);
    }
  });

  it('never rounds a thin branch down to no tile at all', () => {
    expect(tileRepeats(source, 0.001)).toBe(1);
  });

  it('scales the normal gain with the texels a tile is given', () => {
    // Same depth over twice the texels is half the slope per texel, so the gain
    // has to halve with it or the bump doubles when the atlas grows.
    const one = normalStrength(source, 2, 1024);
    const wider = normalStrength(source, 2, 2048);
    expect(wider).toBeCloseTo(one * 2, 6);

    // Deeper bark, stronger normal, in proportion.
    const deeper = normalStrength({ ...source, depthMetres: 0.08 } as BarkSource, 2, 1024);
    expect(deeper).toBeCloseTo(one * 2, 6);
  });
});
