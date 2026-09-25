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
// every fixture open past its test: the temp folder cannot be removed and the
// runner cannot exit. Nothing here reads a file twice, so the cache buys nothing.
sharp.cache(false);
import {
  fitBark,
  fitLeaves,
  leafGrid,
  loadBarkSource,
  loadClumpSource,
  loadFrondSource,
  loadLeafSource,
  normalStrength,
  stampsPerCell,
  tileRepeats,
  type BarkSource,
  type LeafSource,
  matchesPattern,
  splitSourceName,
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
function png16(samples: number[], width: number, height = width): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 0; // greyscale

  // One filter byte per row, then big-endian samples.
  const raw = Buffer.alloc(height * (1 + width * 2));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 2);
    for (let x = 0; x < width; x++) raw.writeUInt16BE(samples[y * width + x], row + 1 + x * 2);
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
  folder: string,
  options: { name?: string; metadata?: unknown; dispDepth?: 8 | 16; heights?: number[]; rows?: number } = {}
): Promise<string> {
  const directory = join(root, 'bark', folder);
  const name = options.name ?? folder;
  await mkdir(directory, { recursive: true });

  // A bark tile may be any shape, and a photograph of bark usually is taller
  // than it is wide.
  const rows = options.rows ?? SIZE;
  const rgb = Buffer.alloc(SIZE * rows * 3, 128);
  const raw = { raw: { width: SIZE, height: rows, channels: 3 as const } };
  await sharp(rgb, raw).webp({ lossless: true }).toFile(join(directory, `${name}-diff.webp`));
  await sharp(rgb, raw).webp({ lossless: true }).toFile(join(directory, `${name}-arm.webp`));

  const depth = options.dispDepth ?? 16;
  if (depth === 16) {
    const samples: number[] = [];
    for (let i = 0; i < SIZE * rows; i++)
      samples.push(options.heights ? options.heights[i % options.heights.length] : i * 37);
    await writeFile(join(directory, `${name}-disp.png`), png16(samples, SIZE, rows));
  } else {
    await sharp(Buffer.alloc(SIZE * rows, 200), { raw: { width: SIZE, height: rows, channels: 1 } })
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
  options: { prefix?: string; metadata?: unknown; alpha?: boolean; extra?: string; slot?: string } = {}
): Promise<string> {
  const directory = join(root, options.slot ?? 'leaves', name);
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
    root = await mkdtemp(join(tmpdir(), 'scatter-forge-sources-'));
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

  it('picks one tile out of a folder that holds several', async () => {
    // A folder is one bark until a second set lands in it. Then a bare name
    // is ambiguous and says so, and folder/set picks — but only ever one.
    await writeSource(root, 'many', { name: 'many-01', rows: 8 });
    await writeSource(root, 'many', { name: 'many-02', rows: 16 });

    await expect(loadBarkSource(['many'], root)).rejects.toThrow(/2 map sets.*many-01, many-02.*'many\/<set>'/);
    await expect(loadBarkSource(['many/many-*'], root)).rejects.toThrow(/2 map sets/);
    await expect(loadBarkSource(['many/none'], root)).rejects.toThrow(/matches none.*many-01, many-02/);

    const source = await loadBarkSource(['many/many-02'], root);
    expect(source?.height).toBe(16);
    expect(source?.directory).toBe(join(root, 'bark', 'many', 'many-02'));
  });

  it('reduces a tile to textureSize on its long edge, keeping its shape', async () => {
    // SIZE wide by 2*SIZE tall. Under a cap of SIZE the long edge halves and
    // so does the short one; under a cap it already fits, nothing moves.
    await writeSource(root, 'tall-tile', { rows: SIZE * 2 });
    const source = (await loadBarkSource(['tall-tile'], root))!;

    expect(fitBark(source, SIZE * 2)).toBe(source);
    expect(fitBark(source, SIZE * 4)).toBe(source);

    const fitted = fitBark(source, SIZE);
    expect([fitted.width, fitted.height]).toEqual([SIZE / 2, SIZE]);
    expect(fitted.aspect).toBe(2);
    expect(fitted.widthMetres).toBe(source.widthMetres);
    expect(fitted.albedo.length).toBe((SIZE / 2) * SIZE * 3);

    // A box filter: the first output texel is the mean of its 2x2 footprint.
    const box = [0, 1, source.width, source.width + 1].map((i) => source.relief[i]);
    expect(fitted.relief[0]).toBeCloseTo(box.reduce((a, b) => a + b) / 4, 6);
    // Twice the metres per texel is half the gradient gain.
    expect(normalStrength(fitted)).toBeCloseTo(normalStrength(source) / 2, 6);
  });

  it('carries a 16-bit height through at full precision', async () => {
    // Every sharp route but toColourspace('grey16') silently hands back the
    // 8-bit downconversion, which would quietly undo the one requirement the
    // derived normals depend on. These values do not survive 8 bits.
    const heights = [1, 2, 3, 40000, 40001, 40002, 65535, 0];
    await writeSource(root, 'precise', { heights });

    const source = await loadBarkSource(['precise'], root);
    expect(source).not.toBeNull();

    const seen = new Set(Array.from(source!.relief, (v) => Math.round(v * 65535)));
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

  it('refuses a folder with no diffuse in it', async () => {
    const directory = join(root, 'bark', 'partial');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'source.json'), JSON.stringify({ widthMetres: 1, depthMetres: 0.1 }));

    // Not null. A folder that exists and is wrong must stop the run, or the art
    // silently does nothing and the generator's output looks like a bug.
    await expect(loadBarkSource(['partial'], root)).rejects.toThrow(/-diff map/);

    // An arm with nothing to go under it is the same mistake, named.
    await sharp(Buffer.alloc(SIZE * SIZE * 3, 200), { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .webp({ lossless: true })
      .toFile(join(directory, 'partial-arm.webp'));
    await expect(loadBarkSource(['partial'], root)).rejects.toThrow(/no partial-diff map/);
  });

  it('derives the arm and height off a diffuse that comes alone', async () => {
    // A vertical ramp, dark at the top, with the rest of the set absent. The
    // luma is stretched to its own 2nd..98th percentile, so the top row lands
    // at 0 and the bottom at 1 whatever exposure the photograph had.
    const directory = join(root, 'bark', 'alone');
    await mkdir(directory, { recursive: true });
    const rgb = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) rgb.fill(40 + y * 20, (y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3);
    await sharp(rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .webp({ lossless: true })
      .toFile(join(directory, 'alone-diff.webp'));
    await writeFile(join(directory, 'source.json'), JSON.stringify({ widthMetres: 1, depthMetres: 0.1 }));

    const source = (await loadBarkSource(['alone'], root))!;
    expect(source.derived).toEqual(['arm', 'disp']);

    const top = 0;
    const bottom = (SIZE - 1) * SIZE;
    expect(source.relief[top]).toBeCloseTo(0, 2);
    expect(source.relief[bottom]).toBeCloseTo(1, 2);
    // Crevice: occluded and rough. Plate: open and smoother. Never metal.
    expect(source.ao[top]).toBeCloseTo(0.5, 2);
    expect(source.ao[bottom]).toBeCloseTo(1, 2);
    expect(source.roughness[top]).toBeGreaterThan(source.roughness[bottom]);
    expect(Math.max(...source.metallic)).toBe(0);
    // Monotonic down the ramp, so the detail survives the stretch.
    for (let y = 1; y < SIZE; y++) expect(source.relief[y * SIZE]).toBeGreaterThan(source.relief[(y - 1) * SIZE]);
  });

  it('takes the maps that are there and derives only the rest', async () => {
    await writeSource(root, 'half');
    await rm(join(root, 'bark', 'half', 'half-disp.png'));

    const source = (await loadBarkSource(['half'], root))!;
    expect(source.derived).toEqual(['disp']);
    // The arm on disk is flat 128; a derived one off a flat diffuse would be
    // the look's floor.
    expect(source.ao[0]).toBeCloseTo(128 / 255, 3);
  });
});

describe('leaf sources', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'scatter-forge-leaves-'));
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

  // One folder of art serves two species: the fern lists the palm's green
  // fronds and leaves its dead ones behind.
  it('takes only the stamps a /pattern names, and refuses one that names none', async () => {
    await writeStamp(root, 'mixed', { prefix: 'green-a' });
    await writeStamp(root, 'mixed', { prefix: 'green-b' });
    await writeStamp(root, 'mixed', { prefix: 'dead-a' });

    const all = await loadLeafSource(['mixed'], root);
    expect(all!.stamps.map((stamp) => stamp.name)).toEqual(['mixed/dead-a', 'mixed/green-a', 'mixed/green-b']);

    const green = await loadLeafSource(['mixed/green-*'], root);
    expect(green!.stamps.map((stamp) => stamp.name)).toEqual(['mixed/green-a', 'mixed/green-b']);
    expect(green!.directories[0]).toContain('green-*');

    const one = await loadLeafSource(['mixed/green-b', 'mixed/dead-?'], root);
    expect(one!.stamps.map((stamp) => stamp.name)).toEqual(['mixed/green-b', 'mixed/dead-a']);

    await expect(loadLeafSource(['mixed/brown-*'], root)).rejects.toThrow(
      /'mixed\/brown-\*' matches none of the stamps in .*: dead-a, green-a, green-b/
    );
  });

  // One loader serves every stamp slot, so a pattern picks the same way on each.
  it('picks by pattern for clump and frond sources too', async () => {
    for (const [slot, load, metadata] of [
      ['clump', loadClumpSource, { heightMetres: 0.4 }],
      ['fronds', loadFrondSource, { lengthMetres: 2 }],
    ] as const) {
      await writeStamp(root, 'set', { prefix: 'keep-a', slot, metadata });
      await writeStamp(root, 'set', { prefix: 'keep-b', slot, metadata });
      await writeStamp(root, 'set', { prefix: 'drop-a', slot, metadata });

      expect((await load(['set'], root))!.stamps).toHaveLength(3);
      expect((await load(['set/keep-*'], root))!.stamps.map((stamp) => stamp.name)).toEqual(['set/keep-a', 'set/keep-b']);
      await expect(load(['set/none-*'], root)).rejects.toThrow(/matches none of the stamps/);
    }
  });

  it('splits a name at its slash and matches a glob whole', () => {
    expect(splitSourceName('oak')).toEqual({ folder: 'oak', pattern: null });
    expect(splitSourceName('oak/green-*')).toEqual({ folder: 'oak', pattern: 'green-*' });
    expect(matchesPattern('green-a', 'green-*')).toBe(true);
    expect(matchesPattern('green-a', 'green')).toBe(false);
    expect(matchesPattern('green-a', 'green-?')).toBe(true);
    expect(matchesPattern('green-ab', 'green-?')).toBe(false);
    expect(matchesPattern('a.b', 'a.b')).toBe(true);
    expect(matchesPattern('axb', 'a.b')).toBe(false);
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

  it("derives a stamp's arm and height off its diffuse alone, levelled on the cutout", async () => {
    // The bar is one flat green over a black margin. Only the bar counts
    // toward the stretch, and a flat cutout has no levels to stretch, so it
    // lands mid-range — not at 1 above a margin that should not count.
    const directory = await writeStamp(root, 'alone');
    await rm(join(directory, 'alone-arm.webp'));
    await rm(join(directory, 'alone-disp.png'));

    const source = (await loadLeafSource(['alone'], root))!;
    const [stamp] = source.stamps;
    expect(stamp.derived).toEqual(['arm', 'disp']);
    expect(stamp.extent).toEqual({ left: 3, right: 4, top: 1, bottom: 6 });

    const onBar = 3 * SIZE + 3;
    expect(stamp.height[onBar]).toBe(0.5);
    expect(stamp.ao[onBar]).toBeCloseTo(0.825, 3);
    expect(stamp.roughness[onBar]).toBeCloseTo(0.55, 3);
    expect(stamp.metallic[onBar]).toBe(0);
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

  it('takes a named grid over the derived one', () => {
    expect(leafGrid(oak, 1, 2)).toBe(2);
    expect(leafGrid(null, 1, 1)).toBe(1);
    expect(leafGrid(oak, 1, 0)).toBe(4);
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

describe('a bark tile of any shape', () => {
  it('takes its aspect from the art rather than being held to a square', async () => {
    // A bark photograph is taller than it is wide, and that shape is what says
    // how much trunk one tile covers along the branch.
    const root = await mkdtemp(join(tmpdir(), 'forge-rect-'));
    await writeSource(root, 'tall', { rows: SIZE * 2, metadata: { widthMetres: 0.8, depthMetres: 0.03 } });

    const source = await loadBarkSource(['tall'], root);

    expect(source!.width).toBe(SIZE);
    expect(source!.height).toBe(SIZE * 2);
    expect(source!.aspect).toBe(2);
    // 0.8m around by 1.6m along.
    expect(source!.widthMetres * source!.aspect).toBeCloseTo(1.6, 6);
    expect(source!.albedo).toHaveLength(SIZE * SIZE * 2 * 3);
    expect(source!.relief).toHaveLength(SIZE * SIZE * 2);

    await rm(root, { recursive: true, force: true });
  });
});

describe('bark scale', () => {
  const source = { widthMetres: 1, depthMetres: 0.04, width: 1024, height: 1024, aspect: 1 } as BarkSource;

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
    // has to halve with it or the bump doubles when the art is authored larger.
    const one = normalStrength(source);
    const wider = normalStrength({ ...source, width: 2048 } as BarkSource);
    expect(wider).toBeCloseTo(one * 2, 6);

    // Deeper bark, stronger normal, in proportion.
    const deeper = normalStrength({ ...source, depthMetres: 0.08 } as BarkSource);
    expect(deeper).toBeCloseTo(one * 2, 6);
  });
});
