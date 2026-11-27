import { ImageLoader } from './ImageLoader';

// Every image "download" takes this long in fake time, so several are in flight
// at once and the concurrency cap is observable.
const LOAD_MS = 10;

type Outcome = 'ok' | 'fail';

// Outcomes per src, consumed in order — lets a test fail the first attempt at a
// URL and succeed on the retry. Missing or exhausted entries succeed.
let script: Map<string, Outcome[]>;
let attempts: string[];
let inFlight: number;
let peakInFlight: number;

// Stands in for fetch: each call resolves with the scripted outcome after
// LOAD_MS.
function installFetchStub() {
  globalThis.fetch = jest.fn((src: string) => {
    attempts.push(src);
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    const outcome = script.get(src)?.shift() ?? 'ok';
    return new Promise<Response>((resolve) =>
      setTimeout(() => {
        inFlight--;
        resolve({
          ok: outcome === 'ok',
          status: outcome === 'ok' ? 200 : 504,
          blob: () => Promise.resolve(new Blob()),
        } as Response);
      }, LOAD_MS)
    );
  }) as unknown as typeof fetch;
}

describe('ImageLoader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    script = new Map();
    attempts = [];
    inFlight = 0;
    peakInFlight = 0;
    globalThis.createImageBitmap = jest
      .fn()
      .mockResolvedValue({ width: 4, height: 2 } as ImageBitmap);
    installFetchStub();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the largest dimensions across the set', async () => {
    (globalThis.createImageBitmap as jest.Mock)
      .mockResolvedValueOnce({ width: 4, height: 8 })
      .mockResolvedValueOnce({ width: 16, height: 2 });

    const loading = new ImageLoader().loadImages(['a.png', 'b.png']);
    await jest.advanceTimersByTimeAsync(LOAD_MS);
    const loader = await loading;

    expect(loader.maxWidth).toBe(16);
    expect(loader.maxHeight).toBe(8);
    expect(loader.images).toHaveLength(2);
  });

  it('never exceeds the concurrency cap', async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `img-${i}.png`);

    const loading = new ImageLoader().loadImages(paths);
    await jest.advanceTimersByTimeAsync(LOAD_MS * paths.length);
    await loading;

    expect(peakInFlight).toBe(6);
    expect(attempts).toHaveLength(20);
  });

  // The point of the retry: a stalled connection times a request out, and the
  // same URL succeeds once the queue drains.
  it('retries a failed load and resolves', async () => {
    script.set('flaky.png', ['fail']);

    const loading = new ImageLoader().loadImages(['flaky.png']);
    await jest.advanceTimersByTimeAsync(5000);
    const loader = await loading;

    expect(attempts).toEqual(['flaky.png', 'flaky.png']);
    expect(loader.images).toHaveLength(1);
  });

  it('gives up after three attempts and names the source', async () => {
    script.set('gone.png', ['fail', 'fail', 'fail']);

    const loading = new ImageLoader().loadImages(['gone.png']);
    const settled = expect(loading).rejects.toThrow(/gone\.png/);
    await jest.advanceTimersByTimeAsync(10000);
    await settled;

    expect(attempts).toHaveLength(3);
  });

  // A retry must not hold its slot through the backoff, or one flaky image would
  // idle a sixth of the pipe while it waits.
  it('frees its slot while backing off', async () => {
    script.set('flaky.png', ['fail']);
    const paths = ['flaky.png', ...Array.from({ length: 12 }, (_, i) => `ok-${i}.png`)];

    const loading = new ImageLoader().loadImages(paths);
    await jest.advanceTimersByTimeAsync(10000);
    await loading;

    expect(peakInFlight).toBe(6);
    expect(attempts.filter((src) => src === 'flaky.png')).toHaveLength(2);
  });
});
