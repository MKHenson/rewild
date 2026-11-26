import { UnusedImages } from './imageCache';

describe('UnusedImages', () => {
  it('counts the bytes of the images it holds', () => {
    const cache = new UnusedImages();
    cache.add('a', 10);
    cache.add('b', 5);
    expect(cache.bytes).toBe(15);
    expect(cache.size).toBe(2);
    expect(cache.remove('a')).toBe(true);
    expect(cache.remove('a')).toBe(false);
    expect(cache.bytes).toBe(5);
  });

  it('frees the oldest images first, down to the limit', () => {
    const cache = new UnusedImages();
    cache.add('a', 10);
    cache.add('b', 10);
    cache.add('c', 10);
    expect(cache.trim(15)).toEqual(['a', 'b']);
    expect(cache.has('c')).toBe(true);
    expect(cache.bytes).toBe(10);
  });

  it('makes an image the newest when it is added again', () => {
    const cache = new UnusedImages();
    cache.add('a', 10);
    cache.add('b', 10);
    cache.add('a', 10);
    expect(cache.bytes).toBe(20);
    expect(cache.trim(10)).toEqual(['b']);
  });

  it('frees everything with a limit of 0', () => {
    const cache = new UnusedImages();
    cache.add('a', 1);
    cache.add('b', 1);
    expect(cache.trim(0)).toEqual(['a', 'b']);
    expect(cache.size).toBe(0);
  });
});
