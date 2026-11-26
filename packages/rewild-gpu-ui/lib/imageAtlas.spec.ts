import {
  ATLAS_SIZE,
  BuddyAllocator,
  blockSize,
  MAX_BLOCK,
  MIN_BLOCK,
} from './imageAtlas';

const area = (a: BuddyAllocator) =>
  a.freeBlocks().reduce((sum, b) => sum + b.size * b.size, 0);

describe('blockSize', () => {
  it('rounds the image and its border up to a power of two', () => {
    expect(blockSize(8, 8)).toBe(MIN_BLOCK);
    expect(blockSize(24, 10)).toBe(32);
    expect(blockSize(25, 10)).toBe(64);
    expect(blockSize(128, 64)).toBe(256);
    expect(blockSize(256, 256)).toBe(512);
    expect(blockSize(504, 100)).toBe(512);
  });

  it('gives null for an image too large for the atlas', () => {
    expect(blockSize(505, 10)).toBeNull();
    expect(blockSize(1024, 1024)).toBeNull();
  });
});

describe('BuddyAllocator', () => {
  it('has no room until a layer is added', () => {
    const a = new BuddyAllocator();
    expect(a.allocate(64)).toBeNull();
    a.addLayer();
    expect(a.layers).toBe(1);
    expect(a.allocate(64)).toEqual({ layer: 0, x: 0, y: 0, size: 64 });
  });

  it('splits a block and keeps the rest free', () => {
    const a = new BuddyAllocator();
    a.addLayer();
    a.allocate(128);
    expect(area(a)).toBe(ATLAS_SIZE * ATLAS_SIZE - 128 * 128);
  });

  it('gives blocks on a multiple of their size, with no overlap', () => {
    const a = new BuddyAllocator();
    a.addLayer();
    const sizes = [16, 512, 64, 32, 256, 16, 128, 64, 16, 512];
    const blocks = sizes.map((size) => a.allocate(size)!);
    for (const b of blocks) {
      expect(b.x % b.size).toBe(0);
      expect(b.y % b.size).toBe(0);
    }
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++) {
        const p = blocks[i];
        const q = blocks[j];
        const apart =
          p.x + p.size <= q.x ||
          q.x + q.size <= p.x ||
          p.y + p.size <= q.y ||
          q.y + q.size <= p.y;
        expect(apart).toBe(true);
      }
  });

  it('joins four free buddies into their parent', () => {
    const a = new BuddyAllocator();
    a.addLayer();
    const blocks = [a.allocate(64)!, a.allocate(64)!, a.allocate(32)!];
    for (const b of blocks) a.release(b);
    expect(area(a)).toBe(ATLAS_SIZE * ATLAS_SIZE);
    // All joined again: only whole top blocks are free.
    expect(a.freeBlocks().every((b) => b.size === MAX_BLOCK)).toBe(true);
  });

  it('uses freed space again', () => {
    const a = new BuddyAllocator();
    a.addLayer();
    const all = Array.from({ length: 16 }, () => a.allocate(MAX_BLOCK)!);
    expect(a.allocate(16)).toBeNull();
    a.release(all[5]);
    expect(a.allocate(256)).toEqual({ ...all[5], size: 256 });
  });

  it('fills a new layer when the first is full', () => {
    const a = new BuddyAllocator();
    a.addLayer();
    for (let i = 0; i < 16; i++) a.allocate(MAX_BLOCK);
    expect(a.allocate(MAX_BLOCK)).toBeNull();
    a.addLayer();
    expect(a.allocate(MAX_BLOCK)?.layer).toBe(1);
  });
});
