import { Vector2 } from 'rewild-common';
import { TerrainChunk } from './TerrainChunk';
import { apronRingLength, assembleApron } from './ApronRing';
import type { Renderer } from '../..';
import { DataTexture } from '../../textures/DataTexture';

// populateSplat creates GPU textures on the first call. These tests only read
// the chunk's bookkeeping, so the upload is a no-op.
beforeEach(() => {
  jest
    .spyOn(DataTexture.prototype, 'load')
    .mockImplementation(function (this: DataTexture) {
      return Promise.resolve(this);
    });
});
afterEach(() => jest.restoreAllMocks());

const SIZE = 5;
const renderer = {} as Renderer;

const makeChunk = () =>
  new TerrainChunk(
    new Vector2(0, 0),
    (SIZE - 1) * 2,
    SIZE,
    [{ lod: 0, visibleDstThreshold: 100 }],
    1,
    'default',
    0
  );

const heights = () => new Float32Array(SIZE * SIZE).fill(4);
const ring = () => new Float32Array(apronRingLength(SIZE)).fill(9);
const splat = () => new Uint8Array(SIZE * SIZE * 4 * 2);

describe('TerrainChunk reuse across LODs', () => {
  describe('cachedApron', () => {
    it('is null until the chunk has heights and a ring', () => {
      const chunk = makeChunk();
      expect(chunk.cachedApron()).toBeNull();
      chunk.populateHeights(heights());
      expect(chunk.cachedApron()).toBeNull();
    });

    it('rebuilds the generated field from the heights and the ring', () => {
      const chunk = makeChunk();
      chunk.populateHeights(heights());
      chunk.populateRing(ring());

      expect(chunk.cachedApron()).toEqual(
        assembleApron(heights(), ring(), SIZE)
      );
    });

    it('is null once the heights are sculpted', () => {
      const chunk = makeChunk();
      chunk.populateHeights(heights());
      chunk.populateRing(ring());
      chunk.setHeights(new Float32Array(SIZE * SIZE).fill(8));

      expect(chunk.cachedApron()).toBeNull();
    });

    it('is null once the heights are edited in place', () => {
      const chunk = makeChunk();
      chunk.populateHeights(heights());
      chunk.populateRing(ring());
      chunk.bumpHeightsVersion();

      expect(chunk.cachedApron()).toBeNull();
    });

    it('rejects a ring of the wrong size', () => {
      expect(() => makeChunk().populateRing(new Float32Array(3))).toThrow();
    });
  });

  describe('hasSplatFor', () => {
    it('is false until a splat lands', () => {
      expect(makeChunk().hasSplatFor(0)).toBe(false);
    });

    it('is true for the heights the splat was built from', () => {
      const chunk = makeChunk();
      chunk.populateSplat(renderer, splat(), 0);
      expect(chunk.hasSplatFor(0)).toBe(true);
    });

    it('is false after a sculpt, until the next splat lands', () => {
      const chunk = makeChunk();
      chunk.populateSplat(renderer, splat(), 0);
      chunk.bumpHeightsVersion();

      expect(chunk.hasSplatFor(chunk.heightsVersion)).toBe(false);
    });
  });

  describe('waterIsCurrent', () => {
    it('is false until a water map lands', () => {
      expect(makeChunk().waterIsCurrent(0, 0)).toBe(false);
    });

    it('is true for the heights and water edit it was built from, dry or not', () => {
      const chunk = makeChunk();
      chunk.populateWater(renderer, null, 0, 0);
      expect(chunk.waterIsCurrent(0, 0)).toBe(true);
    });

    it('is false after a water edit', () => {
      const chunk = makeChunk();
      chunk.populateWater(renderer, null, 0, 0);
      chunk.bumpWaterEditVersion();

      expect(
        chunk.waterIsCurrent(chunk.heightsVersion, chunk.waterEditVersion)
      ).toBe(false);
    });

    it('is false after a sculpt', () => {
      const chunk = makeChunk();
      chunk.populateWater(renderer, null, 0, 0);
      chunk.bumpHeightsVersion();

      expect(
        chunk.waterIsCurrent(chunk.heightsVersion, chunk.waterEditVersion)
      ).toBe(false);
    });
  });
});
